import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import type { Currency } from "@/db/schema";
import { newToken } from "./codes";
import { awardVoaPoints } from "./points";
import type { Settings } from "./settings";
import { convert } from "./suppliers";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type PayTarget = { bookingId?: number; voaId?: number };
export type PaymentKind = "dp" | "pelunasan" | "penuh" | "refund";

export type NewPayment = {
  kind: PaymentKind;
  method: "transfer" | "tunai" | "gateway";
  currency: Currency;
  amount: number;
  receivedBy?: string;
  note?: string | null;
};

/**
 * Insert a payment and move the order forward when it matches the next step.
 * Returns the row and a short note about any status change.
 */
export async function insertPayment(tx: Tx, target: PayTarget, p: NewPayment, settings: Settings) {
  const [payment] = await tx
    .insert(schema.payments)
    .values({
      bookingId: target.bookingId ?? null,
      voaId: target.voaId ?? null,
      kind: p.kind,
      method: p.method,
      currency: p.currency,
      amount: p.amount,
      receivedBy: p.receivedBy ?? "owner",
      receiptToken: newToken(),
      note: p.note ?? null,
    })
    .returning();

  let moved = "";
  if (target.bookingId && p.kind === "penuh") {
    const b = await tx.query.bookings.findFirst({ where: eq(schema.bookings.id, target.bookingId) });
    if (b && (b.status === "hold" || b.status === "penawaran")) {
      await tx.update(schema.bookings).set({ status: "dibayar", updatedAt: new Date() }).where(eq(schema.bookings.id, b.id));
      moved = " Status booking jadi Dibayar.";
    }
  }
  if (target.voaId) {
    const v = await tx.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, target.voaId) });
    if (v && p.kind === "dp" && (v.status === "konfirmasi" || v.status === "dokumen")) {
      await tx.update(schema.voaOrders).set({ status: "dp", dpAt: new Date(), updatedAt: new Date() }).where(eq(schema.voaOrders.id, v.id));
      moved = " Status order jadi DP masuk.";
    }
    if (v && p.kind === "pelunasan" && v.status === "otb_terbit") {
      await tx.update(schema.voaOrders).set({ status: "lunas", updatedAt: new Date() }).where(eq(schema.voaOrders.id, v.id));
      await awardVoaPoints(tx, v, settings);
      moved = " Status order jadi Lunas.";
    }
  }
  return { payment, moved };
}

export type Balance = { currency: Currency; total: number | null; paid: number; due: number | null };

/** What an order costs, what has come in (converted to the order's currency) and what is left. */
export async function orderBalance(target: PayTarget, settings: Settings): Promise<Balance> {
  const db = await getDb();
  let currency: Currency = "IDR";
  let total: number | null = null;
  if (target.bookingId) {
    const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, target.bookingId) });
    currency = b?.currency ?? "IDR";
    total = b?.sellPrice ?? null;
  } else if (target.voaId) {
    const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, target.voaId) });
    currency = "USD";
    total = v?.totalUsd ?? null;
  }
  const rows = await db
    .select({ currency: schema.payments.currency, amount: sql<string>`sum(${schema.payments.amount})` })
    .from(schema.payments)
    .where(
      and(
        target.bookingId ? eq(schema.payments.bookingId, target.bookingId) : eq(schema.payments.voaId, target.voaId!),
        ne(schema.payments.kind, "refund"),
      ),
    )
    .groupBy(schema.payments.currency);
  const paid = Math.round(rows.reduce((s, r) => s + convert(Number(r.amount), r.currency, currency, settings.rates), 0) * 100) / 100;
  return { currency, total, paid, due: total == null ? null : Math.max(0, Math.round((total - paid) * 100) / 100) };
}

/** Make sure an order has a pay-link token and return it. */
export async function ensurePayToken(target: PayTarget): Promise<string> {
  const db = await getDb();
  const table = target.bookingId ? schema.bookings : schema.voaOrders;
  const idCol = target.bookingId ? schema.bookings.id : schema.voaOrders.id;
  const rowId = (target.bookingId ?? target.voaId)!;
  const [row] = await db.select({ token: table.payToken }).from(table).where(eq(idCol, rowId));
  if (row?.token) return row.token;
  const token = newToken();
  // Only set when still empty, so two clicks at once agree on one token.
  await db.update(table).set({ payToken: token }).where(and(eq(idCol, rowId), sql`${table.payToken} is null`));
  const [again] = await db.select({ token: table.payToken }).from(table).where(eq(idCol, rowId));
  return again?.token ?? token;
}
