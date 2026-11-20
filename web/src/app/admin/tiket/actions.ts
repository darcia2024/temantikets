"use server";

import { and, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { BOOKING_STATUS, CHANGE_KIND, CHANGE_STATUS, CURRENCIES, type BookingStatus, type Currency } from "@/db/schema";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { newBookingCode, newToken } from "@/lib/codes";
import { saveUploads } from "@/lib/files";
import { str } from "@/lib/form";
import { parseAmount } from "@/lib/money";
import { awardBookingPoints, reverseBookingPoints } from "@/lib/points";
import { getSettings } from "@/lib/settings";
import { bookingNext, bookingStatusMeta } from "@/lib/status";
import { chargeBooking, convert } from "@/lib/suppliers";
import { localToUtc, routeTimeZone, TZ_WIB } from "@/lib/time";

function bookingFields(formData: FormData) {
  const route = str(formData, "route") ?? "CGK-CAI";
  if (!["CGK-CAI", "CAI-CGK"].includes(route)) fail("Rute tidak valid.");
  const currency = (str(formData, "currency") ?? "IDR") as Currency;
  if (!CURRENCIES.includes(currency)) fail("Mata uang tidak valid.");
  const rawDepart = str(formData, "departAt");
  const departAt = localToUtc(rawDepart, routeTimeZone(route));
  if (rawDepart && !departAt) fail("Format tanggal berangkat tidak valid.");
  const rawLimit = str(formData, "timeLimitAt");
  const timeLimitAt = localToUtc(rawLimit, TZ_WIB);
  if (rawLimit && !timeLimitAt) fail("Format time limit tidak valid.");
  const costPrice = parseAmount(formData.get("costPrice"));
  const sellPrice = parseAmount(formData.get("sellPrice"));
  if ((costPrice != null && costPrice < 0) || (sellPrice != null && sellPrice < 0)) fail("Harga tidak boleh minus.");
  const supplierId = Number(str(formData, "supplierId")) || null;
  return {
    route,
    airline: str(formData, "airline"),
    supplierId,
    pnr: str(formData, "pnr")?.toUpperCase() ?? null,
    departAt,
    timeLimitAt,
    currency,
    costPrice,
    sellPrice,
    ticketNumbers: str(formData, "ticketNumbers"),
    notes: str(formData, "notes"),
  };
}

async function withSupplierName(fields: ReturnType<typeof bookingFields>) {
  if (!fields.supplierId) return { ...fields, supplier: null };
  const db = await getDb();
  const s = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, fields.supplierId) });
  if (!s) fail("Supplier tidak ditemukan.");
  return { ...fields, supplier: s.name };
}

export async function createBooking(formData: FormData) {
  await requireOwner();
  const customerId = Number(str(formData, "customerId"));
  const requestId = Number(str(formData, "requestId")) || null;
  const back = `/admin/tiket/baru?${new URLSearchParams({
    ...(customerId ? { customer: String(customerId) } : {}),
    ...(requestId ? { request: String(requestId) } : {}),
  })}`;
  await guard(back, async () => {
    if (!customerId) fail("Pilih customer dulu.");
    const db = await getDb();
    const fields = await withSupplierName(bookingFields(formData));
    const passengerIds = formData.getAll("passengerIds").map(Number).filter(Boolean);
    const b = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.bookings)
        .values({ ...fields, code: newBookingCode(), customerId, requestId, status: fields.pnr && fields.timeLimitAt ? "hold" : "penawaran" })
        .returning();
      if (passengerIds.length) {
        await tx.insert(schema.bookingPassengers).values(passengerIds.map((passengerId) => ({ bookingId: row.id, passengerId })));
      }
      if (requestId) {
        await tx.update(schema.ticketRequests).set({ status: "diproses", customerId }).where(eq(schema.ticketRequests.id, requestId));
      }
      return row;
    });
    await audit("booking", b.id, "create", null, b);
    revalidatePath("/admin");
    return `/admin/tiket/${b.id}`;
  });
}

export async function updateBooking(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/tiket/${id}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const before = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) });
      if (!before) fail("Booking tidak ditemukan.");
      const fields = await withSupplierName(bookingFields(formData));
      const [after] = await db.update(schema.bookings).set({ ...fields, updatedAt: new Date() }).where(eq(schema.bookings.id, id)).returning();
      await audit("booking", id, "update", before, after);
      revalidatePath(back);
    },
    "Detail booking disimpan.",
  );
}

export async function setBookingStatus(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/tiket/${id}`;
  let warning: string | null = null;
  await guard(back, async () => {
    const db = await getDb();
    const to = str(formData, "to") as BookingStatus;
    if (!BOOKING_STATUS.includes(to)) fail("Status tidak valid.");
    const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) });
    if (!b) fail("Booking tidak ditemukan.");
    if (!bookingNext[b.status].includes(to)) fail(`Tidak bisa pindah dari ${bookingStatusMeta[b.status].label} ke ${bookingStatusMeta[to].label}.`);
    const cancelReason = str(formData, "cancelReason");
    if (to === "batal" && !cancelReason) fail("Isi alasan batal dulu (untuk laporan).");
    if (to === "hold" && (!b.pnr || !b.timeLimitAt)) fail("Isi PNR dan time limit dulu sebelum HOLD (lewat \"Ubah detail booking\").");
    if (to === "issued" && b.status === "dibayar" && !b.ticketNumbers) {
      // Not blocking: many suppliers send the number later, but remind the owner.
      warning = "Issued tersimpan. Nomor tiket belum diisi.";
    }
    const settings = await getSettings();
    const after = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.bookings)
        .set({ status: to, cancelReason: to === "batal" ? cancelReason : b.cancelReason, updatedAt: new Date() })
        .where(eq(schema.bookings.id, id))
        .returning();
      if (to === "issued") {
        const note = await chargeBooking(tx, row, settings.rates);
        if (note) warning = note;
        await awardBookingPoints(tx, row, settings);
      }
      return row;
    });
    await audit("booking", id, `status:${b.status}->${to}`, { status: b.status }, { status: after.status, cancelReason: after.cancelReason });
    revalidatePath(back);
    revalidatePath("/admin");
    return `${back}?ok=${encodeURIComponent(warning ?? `Status jadi ${bookingStatusMeta[to].label}.`)}`;
  });
}

export async function deleteBooking(id: number) {
  await requireOwner();
  const back = `/admin/tiket/${id}`;
  await guard(back, async () => {
    const db = await getDb();
    const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) });
    if (!b) fail("Booking tidak ditemukan.");
    if (!["penawaran", "batal"].includes(b.status)) fail("Hanya booking berstatus Penawaran atau Batal yang bisa dihapus. Batalkan dulu kalau perlu.");
    const [p] = await db.select({ n: count() }).from(schema.payments).where(eq(schema.payments.bookingId, id));
    if (p.n > 0) fail("Booking ini punya catatan pembayaran, jadi tidak dihapus. Biarkan berstatus Batal.");
    const [l] = await db.select({ n: count() }).from(schema.supplierLedger).where(eq(schema.supplierLedger.bookingId, id));
    if (l.n > 0) fail("Booking ini sudah memotong deposit supplier, jadi tidak dihapus.");
    await db.delete(schema.bookings).where(eq(schema.bookings.id, id));
    await audit("booking", id, "delete", b, null);
    revalidatePath("/admin/tiket");
    return `/admin/tiket?ok=${encodeURIComponent(`Booking ${b.code} dihapus.`)}`;
  });
}

export async function uploadBookingFiles(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/tiket/${id}`;
  await guard(back, async () => {
    const kind = str(formData, "kind") === "bukti" ? "bukti" : "tiket";
    const n = (await saveUploads(formData, "files", { bookingId: id }, kind)).length;
    if (n === 0) fail("Pilih file dulu.");
    await audit("booking", id, `upload:${kind}`, null, { files: n });
    revalidatePath(back);
    return `${back}?ok=${encodeURIComponent(`${n} file diupload.`)}`;
  });
}

export async function deleteFile(fileId: number, back: string) {
  await requireOwner();
  if (!back.startsWith("/admin/")) fail("Halaman tidak valid.");
  await guard(
    back,
    async () => {
      const db = await getDb();
      const [f] = await db
        .delete(schema.files)
        .where(eq(schema.files.id, fileId))
        .returning({ id: schema.files.id, filename: schema.files.filename, bookingId: schema.files.bookingId, voaId: schema.files.voaId });
      if (f) await audit("file", f.id, "delete", f, null);
      revalidatePath(back);
    },
    "File dihapus.",
  );
}

export async function setBookingPassengers(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/tiket/${id}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const ids = formData.getAll("passengerIds").map(Number).filter(Boolean);
      await db.transaction(async (tx) => {
        await tx.delete(schema.bookingPassengers).where(eq(schema.bookingPassengers.bookingId, id));
        if (ids.length) await tx.insert(schema.bookingPassengers).values(ids.map((passengerId) => ({ bookingId: id, passengerId })));
      });
      await audit("booking", id, "passengers", null, { passengerIds: ids });
      revalidatePath(back);
    },
    "Penumpang disimpan.",
  );
}

// ---------- Reschedule / refund / name change ----------

export async function createChange(bookingId: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/tiket/${bookingId}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
      if (!b) fail("Booking tidak ditemukan.");
      if (!["issued", "perubahan", "berangkat"].includes(b.status)) fail("Perubahan hanya untuk tiket yang sudah issued.");
      const kind = str(formData, "kind") ?? "reschedule";
      if (!(CHANGE_KIND as readonly string[]).includes(kind)) fail("Jenis perubahan tidak valid.");
      const rawNew = str(formData, "newDepartAt");
      const newDepartAt = localToUtc(rawNew, routeTimeZone(b.route));
      if (kind === "reschedule" && !newDepartAt) fail("Isi tanggal & jam berangkat baru untuk reschedule.");
      const row = await db.transaction(async (tx) => {
        const [c] = await tx
          .insert(schema.bookingChanges)
          .values({
            bookingId,
            kind,
            oldDepartAt: b.departAt,
            newDepartAt,
            currency: b.currency,
            airlineFee: parseAmount(formData.get("airlineFee")),
            serviceFee: parseAmount(formData.get("serviceFee")),
            refundAmount: parseAmount(formData.get("refundAmount")),
            reason: str(formData, "reason"),
          })
          .returning();
        if (b.status === "issued") {
          await tx.update(schema.bookings).set({ status: "perubahan", updatedAt: new Date() }).where(eq(schema.bookings.id, bookingId));
        }
        return c;
      });
      await audit("booking_change", row.id, "create", null, row);
      revalidatePath(back);
    },
    "Pengajuan perubahan dicatat.",
  );
}

export async function updateChange(changeId: number, formData: FormData) {
  await requireOwner();
  const db = await getDb();
  const c = await db.query.bookingChanges.findFirst({ where: eq(schema.bookingChanges.id, changeId) });
  const back = `/admin/tiket/${c?.bookingId ?? ""}`;
  await guard(back, async () => {
    if (!c) fail("Data perubahan tidak ditemukan.");
    const to = str(formData, "status") ?? c.status;
    if (!(CHANGE_STATUS as readonly string[]).includes(to)) fail("Status tidak valid.");
    if (c.status === "selesai" || c.status === "batal") fail("Perubahan ini sudah ditutup.");
    const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, c.bookingId) });
    if (!b) fail("Booking tidak ditemukan.");
    const fees = {
      airlineFee: parseAmount(formData.get("airlineFee")) ?? c.airlineFee,
      serviceFee: parseAmount(formData.get("serviceFee")) ?? c.serviceFee,
      refundAmount: parseAmount(formData.get("refundAmount")) ?? c.refundAmount,
    };
    const supplierRefund = parseAmount(formData.get("supplierRefund"));
    const settings = await getSettings();
    let msg = to === "selesai" ? "Perubahan selesai." : to === "batal" ? "Pengajuan dibatalkan." : "Perubahan disimpan.";

    await db.transaction(async (tx) => {
      await tx.update(schema.bookingChanges).set({ ...fees, status: to, updatedAt: new Date() }).where(eq(schema.bookingChanges.id, changeId));
      const supplier = b.supplierId ? await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.id, b.supplierId) }) : null;

      if (to === "selesai") {
        if (c.kind === "refund") {
          await tx
            .update(schema.bookings)
            .set({ status: "batal", cancelReason: `Refund${c.reason ? `: ${c.reason}` : ""}`, updatedAt: new Date() })
            .where(eq(schema.bookings.id, b.id));
          await reverseBookingPoints(tx, b);
          if (fees.refundAmount && fees.refundAmount > 0) {
            await tx.insert(schema.payments).values({
              bookingId: b.id,
              kind: "refund",
              method: "transfer",
              currency: c.currency,
              amount: fees.refundAmount,
              receiptToken: newToken(),
              note: "Dicatat otomatis dari refund. Ubah metode jika dibayar tunai.",
            });
            msg += " Refund ke customer tercatat di Pembayaran.";
          }
          if (supplier && supplierRefund && supplierRefund > 0) {
            await tx.insert(schema.supplierLedger).values({
              supplierId: supplier.id,
              bookingId: b.id,
              kind: "refund",
              amount: supplierRefund,
              note: `Refund ${b.code}`,
            });
          }
        } else {
          await tx
            .update(schema.bookings)
            .set({
              status: "issued",
              departAt: c.kind === "reschedule" && c.newDepartAt ? c.newDepartAt : b.departAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.bookings.id, b.id));
          if (supplier && fees.airlineFee && fees.airlineFee > 0) {
            await tx.insert(schema.supplierLedger).values({
              supplierId: supplier.id,
              bookingId: b.id,
              kind: "koreksi",
              amount: -convert(fees.airlineFee, c.currency, supplier.currency, settings.rates),
              note: `Biaya ${c.kind} ${b.code}`,
            });
          }
        }
      }

      if (to === "batal" && b.status === "perubahan") {
        const [open] = await tx
          .select({ n: count() })
          .from(schema.bookingChanges)
          .where(
            and(
              eq(schema.bookingChanges.bookingId, b.id),
              ne(schema.bookingChanges.id, changeId),
              inArray(schema.bookingChanges.status, ["diajukan", "diproses"]),
            ),
          );
        if (open.n === 0) {
          await tx.update(schema.bookings).set({ status: "issued", updatedAt: new Date() }).where(eq(schema.bookings.id, b.id));
        }
      }
    });
    await audit("booking_change", changeId, `status:${c.status}->${to}`, c, { ...fees, status: to, supplierRefund });
    revalidatePath(back);
    revalidatePath("/admin");
    return `${back}?ok=${encodeURIComponent(msg)}`;
  });
}
