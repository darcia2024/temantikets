"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { CURRENCIES, type Currency } from "@/db/schema";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/form";
import { parseAmount } from "@/lib/money";
import { insertPayment, type NewPayment, type PaymentKind } from "@/lib/payments";
import { getSettings, saveSettings } from "@/lib/settings";

type Target = { bookingId?: number; voaId?: number };

export async function recordPayment(target: Target, back: string, formData: FormData) {
  await requireOwner();
  if (!back.startsWith("/admin/")) fail("Halaman tidak valid.");
  await guard(back, async () => {
    const db = await getDb();
    const amount = parseAmount(formData.get("amount"));
    if (!amount || amount <= 0) fail("Nominal pembayaran harus lebih dari 0.");
    const currency = (str(formData, "currency") ?? "IDR") as Currency;
    if (!CURRENCIES.includes(currency)) fail("Mata uang tidak valid.");
    const method = str(formData, "method") ?? "transfer";
    if (!["transfer", "tunai", "gateway"].includes(method)) fail("Metode tidak valid.");
    const kind = str(formData, "kind") ?? "penuh";
    if (!["dp", "pelunasan", "penuh", "refund"].includes(kind)) fail("Jenis pembayaran tidak valid.");
    const settings = await getSettings();
    const receivedBy = method === "tunai" ? (str(formData, "receivedBy") ?? "owner") : "owner";
    if (method === "tunai" && !settings.cashHolders.includes(receivedBy)) fail("Pemegang kas tidak dikenal. Atur di halaman Kas.");

    const { payment, moved } = await db.transaction((tx) =>
      insertPayment(
        tx,
        target,
        { kind: kind as PaymentKind, method: method as NewPayment["method"], currency, amount, receivedBy, note: str(formData, "note") },
        settings,
      ),
    );
    await audit("payment", payment.id, "create", null, payment);
    revalidatePath(back);
    revalidatePath("/admin/kas");
    return `${back}?ok=${encodeURIComponent(`Pembayaran tercatat.${moved}`)}`;
  });
}

/** Owner accepts a customer's transfer receipt: it becomes a normal payment. */
export async function acceptProof(proofId: number, back: string, formData: FormData) {
  await requireOwner();
  if (!back.startsWith("/admin/")) fail("Halaman tidak valid.");
  await guard(back, async () => {
    const db = await getDb();
    const proof = await db.query.paymentProofs.findFirst({ where: eq(schema.paymentProofs.id, proofId) });
    if (!proof) fail("Bukti transfer tidak ditemukan.");
    if (proof.status !== "menunggu") fail("Bukti ini sudah diproses.");
    const amount = parseAmount(formData.get("amount")) ?? proof.amount;
    if (!amount || amount <= 0) fail("Nominal harus lebih dari 0.");
    const currency = (str(formData, "currency") ?? proof.currency) as Currency;
    if (!CURRENCIES.includes(currency)) fail("Mata uang tidak valid.");
    const kind = str(formData, "kind") ?? "penuh";
    if (!["dp", "pelunasan", "penuh"].includes(kind)) fail("Jenis pembayaran tidak valid.");
    const settings = await getSettings();
    const target = { bookingId: proof.bookingId ?? undefined, voaId: proof.voaId ?? undefined };
    const result = await db.transaction(async (tx) => {
      // Claim the proof first so a double tap cannot record the payment twice.
      const [claimed] = await tx
        .update(schema.paymentProofs)
        .set({ status: "diterima", reviewedAt: new Date() })
        .where(and(eq(schema.paymentProofs.id, proofId), eq(schema.paymentProofs.status, "menunggu")))
        .returning({ status: schema.paymentProofs.status });
      if (!claimed) fail("Bukti ini sudah diproses.");
      const r = await insertPayment(
        tx,
        target,
        {
          kind: kind as PaymentKind,
          method: "transfer",
          currency,
          amount,
          note: `Bukti transfer${proof.payerName ? ` dari ${proof.payerName}` : ""}${proof.note ? `: ${proof.note}` : ""}`.slice(0, 500),
        },
        settings,
      );
      await tx.update(schema.paymentProofs).set({ paymentId: r.payment.id }).where(eq(schema.paymentProofs.id, proofId));
      return r;
    });
    await audit("payment_proof", proofId, "accept", { status: "menunggu" }, { status: "diterima", paymentId: result.payment.id });
    await audit("payment", result.payment.id, "create", null, result.payment);
    revalidatePath(back);
    revalidatePath("/admin");
    return `${back}?ok=${encodeURIComponent(`Bukti diterima, pembayaran tercatat.${result.moved}`)}`;
  });
}

export async function rejectProof(proofId: number, back: string, formData: FormData) {
  await requireOwner();
  if (!back.startsWith("/admin/")) fail("Halaman tidak valid.");
  await guard(
    back,
    async () => {
      const db = await getDb();
      const reason = str(formData, "reason");
      if (!reason) fail("Isi alasan penolakan (customer akan melihatnya).");
      const [row] = await db
        .update(schema.paymentProofs)
        .set({ status: "ditolak", rejectReason: reason.slice(0, 300), reviewedAt: new Date() })
        .where(and(eq(schema.paymentProofs.id, proofId), eq(schema.paymentProofs.status, "menunggu")))
        .returning();
      if (!row) fail("Bukti ini sudah diproses.");
      await audit("payment_proof", proofId, "reject", { status: "menunggu" }, { status: "ditolak", rejectReason: row.rejectReason });
      revalidatePath(back);
      revalidatePath("/admin");
    },
    "Bukti transfer ditolak.",
  );
}

/** For entry mistakes. Order status is not rolled back automatically. */
export async function deletePayment(paymentId: number, back: string) {
  await requireOwner();
  if (!back.startsWith("/admin/")) fail("Halaman tidak valid.");
  await guard(
    back,
    async () => {
      const db = await getDb();
      const [p] = await db.delete(schema.payments).where(eq(schema.payments.id, paymentId)).returning();
      if (!p) fail("Pembayaran tidak ditemukan.");
      await audit("payment", paymentId, "delete", p, null);
      revalidatePath(back);
      revalidatePath("/admin/kas");
    },
    "Pembayaran dihapus. Cek status order kalau perlu dikembalikan manual.",
  );
}

export async function markDeposited(formData: FormData) {
  await requireOwner();
  await guard("/admin/kas", async () => {
    const db = await getDb();
    const ids = formData.getAll("paymentIds").map(Number).filter(Boolean);
    if (ids.length === 0) fail("Centang penerimaan yang sudah disetor dulu.");
    const rows = await db
      .update(schema.payments)
      .set({ depositedAt: new Date() })
      .where(inArray(schema.payments.id, ids))
      .returning({ id: schema.payments.id, amount: schema.payments.amount, currency: schema.payments.currency });
    await audit("payment", null, "deposited", null, { payments: rows });
    revalidatePath("/admin/kas");
    return `/admin/kas?ok=${encodeURIComponent(`${rows.length} penerimaan ditandai sudah disetor.`)}`;
  });
}

export async function updateMemberSettings(formData: FormData) {
  await requireOwner();
  await guard(
    "/admin/lainnya",
    async () => {
      const num = (k: string) => Math.trunc(Number(str(formData, k)));
      const points = {
        idrPerPoint: num("idrPerPoint"),
        voaPerPax: num("voaPerPax"),
        referralBonus: num("referralBonus"),
        pointValueIdr: num("pointValueIdr"),
      };
      if (Object.values(points).some((v) => !Number.isFinite(v) || v < 0)) fail("Angka poin harus 0 atau lebih.");
      if (points.idrPerPoint === 0) fail("Rupiah per poin tidak boleh 0.");
      const bankAccounts = (str(formData, "bankAccounts") ?? "").slice(0, 1000);
      const before = await getSettings();
      await saveSettings({ points, bankAccounts });
      await audit("settings", null, "member", { points: before.points, bankAccounts: before.bankAccounts }, { points, bankAccounts });
      revalidatePath("/admin/lainnya");
    },
    "Pengaturan member disimpan.",
  );
}

export async function updateRates(formData: FormData) {
  await requireOwner();
  await guard(
    "/admin/kas",
    async () => {
      const usd = parseAmount(formData.get("USD"));
      const egp = parseAmount(formData.get("EGP"));
      if (!usd || !egp || usd <= 0 || egp <= 0) fail("Kurs harus angka lebih dari 0.");
      const holders = (str(formData, "cashHolders") ?? "owner")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const before = await getSettings();
      const patch = { rates: { USD: usd, EGP: egp }, cashHolders: holders.includes("owner") ? holders : ["owner", ...holders] };
      await saveSettings(patch);
      await audit("settings", null, "rates", { rates: before.rates, cashHolders: before.cashHolders }, patch);
      revalidatePath("/admin/kas");
    },
    "Kurs & pemegang kas disimpan.",
  );
}
