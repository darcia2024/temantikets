"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { CURRENCIES, type Currency } from "@/db/schema";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { reqStr, str } from "@/lib/form";
import { parseAmount } from "@/lib/money";

function supplierFields(formData: FormData) {
  const currency = (str(formData, "currency") ?? "IDR") as Currency;
  if (!CURRENCIES.includes(currency)) fail("Mata uang tidak valid.");
  const kind = str(formData, "kind") ?? "konsolidator";
  if (!["konsolidator", "agen", "maskapai", "lainnya"].includes(kind)) fail("Jenis supplier tidak valid.");
  const lowBalance = parseAmount(formData.get("lowBalance"));
  if (lowBalance != null && lowBalance < 0) fail("Batas saldo tidak boleh minus.");
  return { name: reqStr(formData, "name", "Nama supplier"), kind, currency, lowBalance, notes: str(formData, "notes") };
}

export async function createSupplier(formData: FormData) {
  await requireOwner();
  await guard("/admin/supplier", async () => {
    const db = await getDb();
    const fields = supplierFields(formData);
    const dup = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.name, fields.name) });
    if (dup) fail(`Supplier "${fields.name}" sudah ada.`);
    const opening = parseAmount(formData.get("opening"));
    const s = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.suppliers).values(fields).returning();
      if (opening) {
        await tx.insert(schema.supplierLedger).values({ supplierId: row.id, kind: "koreksi", amount: opening, note: "Saldo awal" });
      }
      return row;
    });
    await audit("supplier", s.id, "create", null, { ...s, opening });
    revalidatePath("/admin/supplier");
    return `/admin/supplier/${s.id}`;
  });
}

export async function updateSupplier(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/supplier/${id}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const before = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) });
      if (!before) fail("Supplier tidak ditemukan.");
      const fields = supplierFields(formData);
      const dup = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.name, fields.name) });
      if (dup && dup.id !== id) fail(`Nama "${fields.name}" sudah dipakai supplier lain.`);
      const [l] = await db.select({ n: count() }).from(schema.supplierLedger).where(eq(schema.supplierLedger.supplierId, id));
      if (l.n > 0 && fields.currency !== before.currency) fail("Mata uang deposit tidak bisa diubah setelah ada mutasi.");
      const active = formData.get("active") !== null;
      const [after] = await db.update(schema.suppliers).set({ ...fields, active }).where(eq(schema.suppliers.id, id)).returning();
      // Keep the booking label in sync with the renamed supplier.
      if (before.name !== after.name) await db.update(schema.bookings).set({ supplier: after.name }).where(eq(schema.bookings.supplierId, id));
      await audit("supplier", id, "update", before, after);
      revalidatePath(back);
    },
    "Supplier disimpan.",
  );
}

export async function addLedgerEntry(supplierId: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/supplier/${supplierId}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const kind = str(formData, "kind") ?? "topup";
      if (!["topup", "koreksi"].includes(kind)) fail("Jenis mutasi tidak valid.");
      const raw = parseAmount(formData.get("amount"));
      if (!raw || raw <= 0) fail("Nominal harus lebih dari 0.");
      const direction = str(formData, "direction") === "kurang" ? -1 : 1;
      const amount = kind === "topup" ? raw : raw * direction;
      const note = str(formData, "note");
      if (kind === "koreksi" && !note) fail("Koreksi wajib diberi keterangan.");
      const [row] = await db.insert(schema.supplierLedger).values({ supplierId, kind, amount, note }).returning();
      await audit("supplier_ledger", row.id, "create", null, row);
      revalidatePath(back);
      revalidatePath("/admin/supplier");
    },
    "Mutasi deposit dicatat.",
  );
}

export async function deleteSupplier(id: number) {
  await requireOwner();
  await guard(`/admin/supplier/${id}`, async () => {
    const db = await getDb();
    const s = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) });
    if (!s) fail("Supplier tidak ditemukan.");
    const [l] = await db.select({ n: count() }).from(schema.supplierLedger).where(eq(schema.supplierLedger.supplierId, id));
    const [b] = await db.select({ n: count() }).from(schema.bookings).where(eq(schema.bookings.supplierId, id));
    if (l.n > 0 || b.n > 0) fail("Supplier ini sudah punya mutasi atau booking. Nonaktifkan saja (hilangkan centang Aktif).");
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
    await audit("supplier", id, "delete", s, null);
    revalidatePath("/admin/supplier");
    return `/admin/supplier?ok=${encodeURIComponent(`${s.name} dihapus.`)}`;
  });
}
