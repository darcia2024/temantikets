import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import type { PointRules, Settings } from "./settings";
import { convert } from "./suppliers";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Booking = typeof schema.bookings.$inferSelect;
type Voa = typeof schema.voaOrders.$inferSelect;

/** Points earned on a ticket: 1 per `idrPerPoint` Rupiah of margin, rounded down. */
export function bookingPoints(b: Pick<Booking, "sellPrice" | "costPrice" | "currency">, rules: PointRules, rates: Settings["rates"]): number {
  if (b.sellPrice == null || b.costPrice == null || rules.idrPerPoint <= 0) return 0;
  const margin = convert(b.sellPrice - b.costPrice, b.currency, "IDR", rates);
  return margin > 0 ? Math.floor(margin / rules.idrPerPoint) : 0;
}

async function referralBonus(tx: Tx, customerId: number, code: string, rules: PointRules): Promise<void> {
  if (rules.referralBonus <= 0) return;
  const c = await tx.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c?.referredById) return;
  // Unique index on referee_id: only the friend's first order pays out.
  await tx
    .insert(schema.pointLedger)
    .values({ customerId: c.referredById, kind: "referral", points: rules.referralBonus, refereeId: c.id, note: `Teman (${c.name}) order pertama ${code}` })
    .onConflictDoNothing();
}

/** Called when a ticket is issued. Safe to call twice. */
export async function awardBookingPoints(tx: Tx, b: Booking, settings: Settings): Promise<number> {
  const pts = bookingPoints(b, settings.points, settings.rates);
  if (pts > 0) {
    await tx
      .insert(schema.pointLedger)
      .values({ customerId: b.customerId, kind: "belanja", points: pts, bookingId: b.id, note: `Tiket ${b.code}` })
      .onConflictDoNothing();
  }
  await referralBonus(tx, b.customerId, b.code, settings.points);
  return pts;
}

/** Called when a VOA order is paid off. Safe to call twice. */
export async function awardVoaPoints(tx: Tx, v: Voa, settings: Settings): Promise<number> {
  const pts = Math.max(0, Math.floor(v.pax * settings.points.voaPerPax));
  if (pts > 0) {
    await tx
      .insert(schema.pointLedger)
      .values({ customerId: v.customerId, kind: "belanja", points: pts, voaId: v.id, note: `VOA ${v.code}` })
      .onConflictDoNothing();
  }
  await referralBonus(tx, v.customerId, v.code, settings.points);
  return pts;
}

/** Take back the points of a refunded ticket. The referral bonus stays. */
export async function reverseBookingPoints(tx: Tx, b: Booking): Promise<void> {
  const earned = await tx.query.pointLedger.findFirst({
    where: and(eq(schema.pointLedger.bookingId, b.id), eq(schema.pointLedger.kind, "belanja")),
  });
  if (!earned) return;
  await tx
    .insert(schema.pointLedger)
    .values({ customerId: b.customerId, kind: "batal", points: -earned.points, bookingId: b.id, note: `Refund ${b.code}` })
    .onConflictDoNothing();
}

export async function pointBalance(customerId: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<string | null>`sum(${schema.pointLedger.points})` })
    .from(schema.pointLedger)
    .where(eq(schema.pointLedger.customerId, customerId));
  return Number(row?.total ?? 0);
}

export async function pointHistory(customerId: number, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(schema.pointLedger)
    .where(eq(schema.pointLedger.customerId, customerId))
    .orderBy(desc(schema.pointLedger.createdAt), desc(schema.pointLedger.id))
    .limit(limit);
}

export const pointKindLabel: Record<string, string> = {
  belanja: "Belanja",
  referral: "Ajak teman",
  tukar: "Ditukar",
  koreksi: "Koreksi",
  batal: "Dibatalkan",
};
