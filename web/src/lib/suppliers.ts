import { eq, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import type { Currency } from "@/db/schema";
import type { Settings } from "./settings";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Convert between IDR/USD/EGP using the owner's rates (Rupiah per unit). */
export function convert(amount: number, from: Currency, to: Currency, rates: Settings["rates"]): number {
  if (from === to) return amount;
  const idr = from === "IDR" ? amount : amount * rates[from];
  const out = to === "IDR" ? idr : idr / rates[to];
  return Math.round(out * 100) / 100;
}

export async function supplierBalances(): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db
    .select({ supplierId: schema.supplierLedger.supplierId, balance: sql<string>`sum(${schema.supplierLedger.amount})` })
    .from(schema.supplierLedger)
    .groupBy(schema.supplierLedger.supplierId);
  return new Map(rows.map((r) => [r.supplierId, Number(r.balance)]));
}

/**
 * Charge a booking's cost against its supplier deposit, once.
 * Returns a note when it could not charge, so the caller can tell the owner.
 */
export async function chargeBooking(
  tx: Tx,
  b: typeof schema.bookings.$inferSelect,
  rates: Settings["rates"],
): Promise<string | null> {
  if (!b.supplierId) return null;
  if (b.costPrice == null) return "Harga modal kosong, deposit supplier belum dipotong.";
  const supplier = await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.id, b.supplierId) });
  if (!supplier) return null;
  const amount = convert(b.costPrice, b.currency, supplier.currency, rates);
  await tx
    .insert(schema.supplierLedger)
    .values({ supplierId: supplier.id, bookingId: b.id, kind: "potong", amount: -amount, note: `Issued ${b.code}` })
    .onConflictDoNothing();
  return null;
}
