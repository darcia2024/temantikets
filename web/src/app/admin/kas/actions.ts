"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { CURRENCIES, type Currency } from "@/db/schema";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { newToken } from "@/lib/codes";
import { str } from "@/lib/form";
import { parseAmount } from "@/lib/money";
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

    let moved = "";
    const payment = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(schema.payments)
        .values({
          bookingId: target.bookingId ?? null,
          voaId: target.voaId ?? null,
          kind,
          method,
          currency,
          amount,
          receivedBy,
          receiptToken: newToken(),
          note: str(formData, "note"),
        })
        .returning();

      // Move the order forward when the payment matches the next step.
      if (target.bookingId && kind === "penuh") {
        const b = await tx.query.bookings.findFirst({ where: eq(schema.bookings.id, target.bookingId) });
        if (b && (b.status === "hold" || b.status === "penawaran")) {
          await tx.update(schema.bookings).set({ status: "dibayar", updatedAt: new Date() }).where(eq(schema.bookings.id, b.id));
          moved = " Status booking jadi Dibayar.";
        }
      }
      if (target.voaId) {
        const v = await tx.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, target.voaId) });
        if (v && kind === "dp" && (v.status === "konfirmasi" || v.status === "dokumen")) {
          await tx.update(schema.voaOrders).set({ status: "dp", dpAt: new Date(), updatedAt: new Date() }).where(eq(schema.voaOrders.id, v.id));
          moved = " Status order jadi DP masuk.";
        }
        if (v && kind === "pelunasan" && v.status === "otb_terbit") {
          await tx.update(schema.voaOrders).set({ status: "lunas", updatedAt: new Date() }).where(eq(schema.voaOrders.id, v.id));
          moved = " Status order jadi Lunas.";
        }
      }
      return p;
    });
    await audit("payment", payment.id, "create", null, payment);
    revalidatePath(back);
    revalidatePath("/admin/kas");
    return `${back}?ok=${encodeURIComponent(`Pembayaran tercatat.${moved}`)}`;
  });
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
