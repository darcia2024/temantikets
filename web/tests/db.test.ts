import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { chargeBooking } from "@/lib/suppliers";

const rates = { USD: 16500, EGP: 330 };
let db: ReturnType<typeof drizzle<typeof schema>>;
let customerId: number;

beforeAll(async () => {
  // Fresh in-memory Postgres with every migration applied, exactly as production gets them.
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "..", "drizzle") });
  const [c] = await db.insert(schema.customers).values({ name: "Tes", wa: "6281200000099" }).returning();
  customerId = c.id;
});

async function newBooking(over: Partial<typeof schema.bookings.$inferInsert> = {}) {
  const [b] = await db
    .insert(schema.bookings)
    .values({ code: `TT-TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, customerId, route: "CGK-CAI", ...over })
    .returning();
  return b;
}

describe("migrations", () => {
  it("enable row level security on every table", async () => {
    const res = await db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace`,
    );
    const rows = res.rows.filter((r) => !r.relname.startsWith("__drizzle"));
    expect(rows.length).toBeGreaterThanOrEqual(16);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
});

describe("constraints", () => {
  it("rejects a WhatsApp number used twice", async () => {
    await expect(db.insert(schema.customers).values({ name: "Dobel", wa: "6281200000099" })).rejects.toThrow();
  });

  it("rejects unknown booking statuses", async () => {
    await expect(newBooking({ status: "ngawur" as never })).rejects.toThrow();
  });

  it("requires a payment to belong to exactly one booking or VOA order", async () => {
    await expect(
      db.insert(schema.payments).values({ method: "tunai", currency: "EGP", amount: 100, receiptToken: "t-none-000000000000000" }),
    ).rejects.toThrow();
    await expect(
      db.insert(schema.payments).values({ bookingId: (await newBooking()).id, method: "tunai", currency: "EGP", amount: -5, receiptToken: "t-neg-0000000000000000" }),
    ).rejects.toThrow();
  });
});

describe("supplier deposit", () => {
  it("charges an issued booking once, converted to the deposit currency", async () => {
    const [s] = await db.insert(schema.suppliers).values({ name: "Konsolidator Tes", currency: "IDR" }).returning();
    await db.insert(schema.supplierLedger).values({ supplierId: s.id, kind: "topup", amount: 50_000_000 });
    const b = await newBooking({ supplierId: s.id, currency: "USD", costPrice: 600, status: "issued" });

    await db.transaction((tx) => chargeBooking(tx, b, rates));
    await db.transaction((tx) => chargeBooking(tx, b, rates)); // second click must not double-charge

    const rows = await db.select().from(schema.supplierLedger).where(eq(schema.supplierLedger.supplierId, s.id));
    expect(rows.map((r) => [r.kind, r.amount])).toEqual([
      ["topup", 50_000_000],
      ["potong", -9_900_000],
    ]);

    // Fees from a later reschedule are separate entries and are allowed.
    await db.insert(schema.supplierLedger).values({ supplierId: s.id, bookingId: b.id, kind: "koreksi", amount: -500_000 });
    const [{ total }] = await db
      .select({ total: sql<string>`sum(amount)` })
      .from(schema.supplierLedger)
      .where(eq(schema.supplierLedger.supplierId, s.id));
    expect(Number(total)).toBe(39_600_000);
  });

  it("tells the owner when a booking has no cost price", async () => {
    const [s] = await db.insert(schema.suppliers).values({ name: "Agen Tanpa Modal" }).returning();
    const b = await newBooking({ supplierId: s.id, costPrice: null });
    const note = await db.transaction((tx) => chargeBooking(tx, b, rates));
    expect(note).toMatch(/Harga modal kosong/);
  });
});

describe("audit log", () => {
  it("stores before/after as JSON", async () => {
    await db.insert(schema.auditLog).values({ actor: "owner", entity: "booking", entityId: 1, action: "update", before: { a: 1 }, after: { a: 2 } });
    const [row] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entity, "booking"));
    expect(row.after).toEqual({ a: 2 });
  });
});
