"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { bool, reqStr, str } from "@/lib/form";
import { normalizeWa } from "@/lib/phone";

function customerFields(formData: FormData) {
  const wa = normalizeWa(str(formData, "wa"));
  if (!wa) fail("Nomor WA tidak valid. Contoh: 0812..., +62..., atau nomor Mesir 01...");
  const rawParent = str(formData, "waParent");
  const waParent = normalizeWa(rawParent);
  if (rawParent && !waParent) fail("Nomor WA orang tua tidak valid.");
  return { name: reqStr(formData, "name", "Nama"), wa, waParent, notes: str(formData, "notes") };
}

export async function createCustomer(formData: FormData) {
  await requireOwner();
  await guard("/admin/customer/baru", async () => {
    const db = await getDb();
    const values = customerFields(formData);
    const existing = await db.query.customers.findFirst({ where: eq(schema.customers.wa, values.wa) });
    if (existing) return `/admin/customer/${existing.id}?ok=${encodeURIComponent("Nomor ini sudah terdaftar, ini datanya.")}`;
    const [c] = await db.insert(schema.customers).values({ ...values, source: "manual" }).returning();
    await audit("customer", c.id, "create", null, c);
    revalidatePath("/admin/customer");
    return `/admin/customer/${c.id}`;
  });
}

export async function updateCustomer(id: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/customer/${id}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const values = customerFields(formData);
      const taken = await db.query.customers.findFirst({ where: eq(schema.customers.wa, values.wa) });
      if (taken && taken.id !== id) fail(`Nomor WA sudah dipakai customer lain (${taken.name}).`);
      const before = await db.query.customers.findFirst({ where: eq(schema.customers.id, id) });
      const [after] = await db.update(schema.customers).set(values).where(eq(schema.customers.id, id)).returning();
      await audit("customer", id, "update", before, after);
      revalidatePath(back);
    },
    "Data customer disimpan.",
  );
}

export async function deleteCustomer(id: number) {
  await requireOwner();
  await guard(`/admin/customer/${id}`, async () => {
    const db = await getDb();
    const [b] = await db.select({ n: count() }).from(schema.bookings).where(eq(schema.bookings.customerId, id));
    const [v] = await db.select({ n: count() }).from(schema.voaOrders).where(eq(schema.voaOrders.customerId, id));
    if (b.n > 0 || v.n > 0) fail(`Tidak bisa dihapus: customer ini punya ${b.n} booking dan ${v.n} order VOA. Riwayat transaksi harus tetap tersimpan.`);
    const before = await db.query.customers.findFirst({ where: eq(schema.customers.id, id) });
    if (!before) fail("Customer tidak ditemukan.");
    // Passengers cascade; requests keep their copy of name/WA (customer_id → null).
    await db.delete(schema.customers).where(eq(schema.customers.id, id));
    await audit("customer", id, "delete", before, null);
    revalidatePath("/admin/customer");
    return `/admin/customer?ok=${encodeURIComponent(`${before.name} dihapus.`)}`;
  });
}

function passengerFields(formData: FormData) {
  return {
    fullName: reqStr(formData, "fullName", "Nama sesuai paspor").toUpperCase(),
    passportNo: str(formData, "passportNo")?.toUpperCase() ?? null,
    birthDate: str(formData, "birthDate"),
    passportExpiry: str(formData, "passportExpiry"),
    isStudent: bool(formData, "isStudent"),
  };
}

export async function addPassenger(customerId: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/customer/${customerId}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const [p] = await db
        .insert(schema.passengers)
        .values({ customerId, ...passengerFields(formData) })
        .returning();
      await audit("passenger", p.id, "create", null, p);
      revalidatePath(back);
    },
    "Penumpang ditambahkan.",
  );
}

export async function updatePassenger(passengerId: number, formData: FormData) {
  await requireOwner();
  const db = await getDb();
  const before = await db.query.passengers.findFirst({ where: eq(schema.passengers.id, passengerId) });
  const back = `/admin/customer/${before?.customerId ?? ""}`;
  await guard(
    back,
    async () => {
      if (!before) fail("Penumpang tidak ditemukan.");
      const [after] = await db
        .update(schema.passengers)
        .set(passengerFields(formData))
        .where(eq(schema.passengers.id, passengerId))
        .returning();
      await audit("passenger", passengerId, "update", before, after);
      revalidatePath(back);
    },
    "Data penumpang disimpan.",
  );
}

export async function deletePassenger(passengerId: number) {
  await requireOwner();
  const db = await getDb();
  const before = await db.query.passengers.findFirst({ where: eq(schema.passengers.id, passengerId) });
  const back = `/admin/customer/${before?.customerId ?? ""}`;
  await guard(
    back,
    async () => {
      if (!before) fail("Penumpang tidak ditemukan.");
      const [b] = await db.select({ n: count() }).from(schema.bookingPassengers).where(eq(schema.bookingPassengers.passengerId, passengerId));
      const [v] = await db.select({ n: count() }).from(schema.voaPassengers).where(eq(schema.voaPassengers.passengerId, passengerId));
      if (b.n > 0 || v.n > 0) fail(`${before.fullName} masih tercatat di ${b.n} booking dan ${v.n} order VOA. Lepas dulu dari booking/order itu.`);
      await db.delete(schema.passengers).where(eq(schema.passengers.id, passengerId));
      await audit("passenger", passengerId, "delete", before, null);
      revalidatePath(back);
    },
    "Penumpang dihapus.",
  );
}
