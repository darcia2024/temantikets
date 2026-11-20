"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { bool, reqStr, str } from "@/lib/form";
import { createLoginLink, normalizeReferralCode, revokeMemberSessions } from "@/lib/member";
import { normalizeWa } from "@/lib/phone";
import { pointBalance } from "@/lib/points";
import { waLink } from "@/lib/wa";

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

// ---------- Member area ----------

/** Creates a one-time login link and opens WhatsApp with it, so the link never sits in a URL or log here. */
export async function sendLoginLink(customerId: number) {
  await requireOwner();
  const back = `/admin/customer/${customerId}`;
  await guard(back, async () => {
    const db = await getDb();
    const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
    if (!c) fail("Customer tidak ditemukan.");
    const link = await createLoginLink(c.id);
    await audit("customer", c.id, "login_link", null, { expiresInDays: 7 });
    return waLink(
      c.wa,
      `Assalamualaikum ${c.name}, ini link masuk ke akun Temantiket kamu:\n${link}\n\n` +
        `Di sana kamu bisa lihat e-ticket, OK to Board, poin, dan kirim bukti transfer. ` +
        `Link berlaku 7 hari dan hanya untuk kamu, jangan diteruskan ya.\n\nSalam,\nTemantiket`,
    );
  });
}

export async function revokeLogins(customerId: number) {
  await requireOwner();
  await guard(
    `/admin/customer/${customerId}`,
    async () => {
      await revokeMemberSessions(customerId);
      await audit("customer", customerId, "revoke_logins", null, null);
    },
    "Semua sesi login customer ini dikeluarkan.",
  );
}

export async function adjustPoints(customerId: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/customer/${customerId}`;
  await guard(
    back,
    async () => {
      const kind = str(formData, "kind") === "koreksi" ? "koreksi" : "tukar";
      const raw = Math.trunc(Number(str(formData, "points")));
      if (!Number.isFinite(raw) || raw === 0) fail("Isi jumlah poin.");
      // "Tukar" always spends; "koreksi" may go either way.
      const points = kind === "tukar" ? -Math.abs(raw) : raw;
      const balance = await pointBalance(customerId);
      if (balance + points < 0) fail(`Poin tidak cukup. Saldo sekarang ${balance}.`);
      const db = await getDb();
      const [row] = await db
        .insert(schema.pointLedger)
        .values({ customerId, kind, points, note: str(formData, "note")?.slice(0, 200) ?? null })
        .returning();
      await audit("points", row.id, "create", null, row);
      revalidatePath(back);
    },
    "Poin dicatat.",
  );
}

export async function setReferrer(customerId: number, formData: FormData) {
  await requireOwner();
  const back = `/admin/customer/${customerId}`;
  await guard(
    back,
    async () => {
      const db = await getDb();
      const code = normalizeReferralCode(str(formData, "code"));
      const referrer = code ? await db.query.customers.findFirst({ where: eq(schema.customers.referralCode, code) }) : null;
      if (str(formData, "code") && !referrer) fail("Kode ajakan tidak ditemukan.");
      if (referrer?.id === customerId) fail("Customer tidak bisa mengajak dirinya sendiri.");
      const before = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
      await db.update(schema.customers).set({ referredById: referrer?.id ?? null }).where(eq(schema.customers.id, customerId));
      await audit("customer", customerId, "referrer", { referredById: before?.referredById ?? null }, { referredById: referrer?.id ?? null });
      revalidatePath(back);
    },
    "Pengajak disimpan.",
  );
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
