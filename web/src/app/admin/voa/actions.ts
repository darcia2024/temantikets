"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { VOA_STATUS, type VoaStatus } from "@/db/schema";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { newVoaCode } from "@/lib/codes";
import { saveUploads } from "@/lib/files";
import { bool, int, str } from "@/lib/form";
import { parseAmount } from "@/lib/money";
import { awardVoaPoints } from "@/lib/points";
import { getSettings, voaTierFor } from "@/lib/settings";
import { voaNext, voaStatusMeta } from "@/lib/status";
import { localToUtc, TZ_CAIRO } from "@/lib/time";

async function voaFields(formData: FormData) {
  const pax = int(formData, "pax", 0);
  if (pax < 1 || pax > 200) fail("Jumlah orang harus 1-200.");
  const settings = await getSettings();
  const manual = parseAmount(formData.get("rateUsd"));
  if (manual != null && manual <= 0) fail("Tarif harus lebih dari 0.");
  // Manual rate wins (e.g. a negotiated group price); otherwise use the tier table.
  const rateUsd = manual ?? voaTierFor(settings.voaTiers, pax)?.rateUsd ?? null;
  const rawArrival = str(formData, "arrivalAt");
  const arrivalAt = localToUtc(rawArrival, TZ_CAIRO);
  if (rawArrival && !arrivalAt) fail("Format jadwal tiba tidak valid.");
  return {
    pax,
    rateUsd,
    totalUsd: rateUsd != null ? rateUsd * pax : null,
    arrivalAt,
    airline: str(formData, "airline"),
    flightNo: str(formData, "flightNo")?.toUpperCase() ?? null,
    terminal: str(formData, "terminal"),
    notes: str(formData, "notes"),
  };
}

export async function createVoa(formData: FormData) {
  await requireOwner();
  const customerId = Number(str(formData, "customerId"));
  const back = `/admin/voa/baru${customerId ? `?customer=${customerId}` : ""}`;
  await guard(back, async () => {
    if (!customerId) fail("Pilih customer dulu.");
    const db = await getDb();
    const bookingId = Number(str(formData, "bookingId")) || null;
    const passengerIds = formData.getAll("passengerIds").map(Number).filter(Boolean);
    const fields = await voaFields(formData);
    const v = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.voaOrders).values({ ...fields, code: newVoaCode(), customerId, bookingId }).returning();
      if (passengerIds.length) {
        await tx.insert(schema.voaPassengers).values(passengerIds.map((passengerId) => ({ voaId: row.id, passengerId })));
      }
      return row;
    });
    await audit("voa", v.id, "create", null, v);
    revalidatePath("/admin/voa");
    return `/admin/voa/${v.id}`;
  });
}

export async function updateVoa(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/voa/${id}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const before = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, id) });
      if (!before) fail("Order tidak ditemukan.");
      const [after] = await db
        .update(schema.voaOrders)
        .set({ ...(await voaFields(formData)), updatedAt: new Date() })
        .where(eq(schema.voaOrders.id, id))
        .returning();
      await audit("voa", id, "update", before, after);
      revalidatePath(back);
    },
    "Detail order disimpan.",
  );
}

export async function setVoaDocs(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/voa/${id}`;
  await guard(back, async () => {
    const db = await getDb();
    const docsPassport = bool(formData, "docsPassport");
    const docsTicket = bool(formData, "docsTicket");
    const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, id) });
    if (!v) fail("Order tidak ditemukan.");
    const promote = v.status === "konfirmasi" && docsPassport && docsTicket;
    await db
      .update(schema.voaOrders)
      .set({ docsPassport, docsTicket, status: promote ? "dokumen" : v.status, updatedAt: new Date() })
      .where(eq(schema.voaOrders.id, id));
    await audit("voa", id, "docs", { docsPassport: v.docsPassport, docsTicket: v.docsTicket }, { docsPassport, docsTicket });
    revalidatePath(back);
    return `${back}?ok=${encodeURIComponent(promote ? "Dokumen lengkap. Status jadi Dokumen lengkap, siap tagih DP." : "Checklist disimpan.")}`;
  });
}

export async function setVoaStatus(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/voa/${id}`;
  await guard(back, async () => {
    const db = await getDb();
    const to = str(formData, "to") as VoaStatus;
    if (!VOA_STATUS.includes(to)) fail("Status tidak valid.");
    const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, id) });
    if (!v) fail("Order tidak ditemukan.");
    if (!voaNext[v.status].includes(to)) fail(`Tidak bisa pindah dari ${voaStatusMeta[v.status].label} ke ${voaStatusMeta[to].label}.`);
    if (to === "dokumen" && !(v.docsPassport && v.docsTicket)) fail("Centang paspor dan tiket PP di checklist dulu.");
    if (to === "otb_terbit") {
      const [f] = await db
        .select({ n: count() })
        .from(schema.files)
        .where(and(eq(schema.files.voaId, id), eq(schema.files.kind, "otb")));
      if (f.n === 0) fail("Upload file OK to Board dulu sebelum menandai terbit.");
    }
    const cancelReason = str(formData, "cancelReason");
    if (to === "batal" && !cancelReason) fail("Isi alasan batal dulu.");
    const now = new Date();
    const settings = await getSettings();
    const [after] = await db
      .update(schema.voaOrders)
      .set({
        status: to,
        dpAt: to === "dp" ? (v.dpAt ?? now) : v.dpAt,
        otbIssuedAt: to === "otb_terbit" ? now : v.otbIssuedAt,
        mandubStatus: to === "dijemput" && v.mandubStatus === "belum" ? "menunggu_gate" : to === "selesai" ? "keluar" : v.mandubStatus,
        cancelReason: to === "batal" ? (v.dpAt ? `${cancelReason} (DP jadi cancellation fee)` : cancelReason) : v.cancelReason,
        updatedAt: now,
      })
      .where(eq(schema.voaOrders.id, id))
      .returning();
    if (to === "lunas") await db.transaction((tx) => awardVoaPoints(tx, after, settings));
    await audit("voa", id, `status:${v.status}->${to}`, { status: v.status }, { status: after.status, cancelReason: after.cancelReason });
    revalidatePath(back);
    revalidatePath("/admin");
    return `${back}?ok=${encodeURIComponent(`Status jadi ${voaStatusMeta[to].label}.`)}`;
  });
}

export async function deleteVoa(id: number) {
  await requireOwner();
  await guard(`/admin/voa/${id}`, async () => {
    const db = await getDb();
    const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, id) });
    if (!v) fail("Order tidak ditemukan.");
    if (!["konfirmasi", "batal"].includes(v.status)) fail("Hanya order berstatus Konfirmasi atau Batal yang bisa dihapus.");
    const [p] = await db.select({ n: count() }).from(schema.payments).where(eq(schema.payments.voaId, id));
    if (p.n > 0) fail("Order ini punya catatan pembayaran, jadi tidak dihapus. Biarkan berstatus Batal.");
    await db.delete(schema.voaOrders).where(eq(schema.voaOrders.id, id));
    await audit("voa", id, "delete", v, null);
    revalidatePath("/admin/voa");
    return `/admin/voa?ok=${encodeURIComponent(`Order ${v.code} dihapus.`)}`;
  });
}

export async function uploadVoaFiles(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/voa/${id}`;
  await guard(back, async () => {
    const k = str(formData, "kind");
    const kind = k === "otb" || k === "boarding" || k === "bukti" ? k : "lainnya";
    const n = (await saveUploads(formData, "files", { voaId: id }, kind)).length;
    if (n === 0) fail("Pilih file dulu.");
    await audit("voa", id, `upload:${kind}`, null, { files: n });
    revalidatePath(back);
    return `${back}?ok=${encodeURIComponent(`${n} file diupload.`)}`;
  });
}

export async function setVoaPassengers(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/voa/${id}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const ids = formData.getAll("passengerIds").map(Number).filter(Boolean);
      await db.transaction(async (tx) => {
        await tx.delete(schema.voaPassengers).where(eq(schema.voaPassengers.voaId, id));
        if (ids.length) await tx.insert(schema.voaPassengers).values(ids.map((passengerId) => ({ voaId: id, passengerId })));
      });
      await audit("voa", id, "passengers", null, { passengerIds: ids });
      revalidatePath(back);
    },
    "Pemohon disimpan.",
  );
}
