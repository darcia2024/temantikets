// Sample data for local development. Usage: npm run db:seed (dev server must be stopped:
// PGlite allows one process at a time).
import { getDb, schema } from "../src/db";
import { newBookingCode, newRequestCode, newToken, newVoaCode } from "../src/lib/codes";

const db = await getDb();
const existing = await db.select({ id: schema.customers.id }).from(schema.customers).limit(1);
if (existing.length) {
  console.log("Database sudah berisi data, seed dilewati.");
  process.exit(0);
}

const hours = (h: number) => new Date(Date.now() + h * 3600000);

const [ahmad, siti, budi] = await db
  .insert(schema.customers)
  .values([
    { name: "Ahmad Fauzi (contoh)", wa: "6281200000001", waParent: "6281200000011", source: "wa" },
    { name: "Siti Rahma (contoh)", wa: "201000000002", source: "wa" },
    { name: "Bu Lina - Rombongan (contoh)", wa: "6281200000003", source: "wa" },
  ])
  .returning();

const [pAhmad, pSiti, pBudi1, pBudi2] = await db
  .insert(schema.passengers)
  .values([
    { customerId: ahmad.id, fullName: "AHMAD FAUZI", passportNo: "X0000001", passportExpiry: "2029-03-01", isStudent: true },
    { customerId: siti.id, fullName: "SITI RAHMA", passportNo: "X0000002", passportExpiry: "2027-02-10", isStudent: true },
    { customerId: budi.id, fullName: "LINA SARI", passportNo: "X0000003", passportExpiry: "2030-01-01" },
    { customerId: budi.id, fullName: "BUDI SANTOSO", passportNo: "X0000004", passportExpiry: "2030-01-01" },
  ])
  .returning();

await db.insert(schema.ticketRequests).values({
  code: newRequestCode(),
  name: "Rizki (contoh)",
  wa: "6281200000009",
  route: "CGK-CAI",
  departDate: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10),
  flexDays: 3,
  pax: 1,
  priority: "bagasi",
  wantsVoa: true,
  notes: "Maba, bawa kitab banyak",
});

const [b1, b2] = await db
  .insert(schema.bookings)
  .values([
    {
      code: newBookingCode(),
      customerId: ahmad.id,
      route: "CAI-CGK",
      airline: "Saudia",
      pnr: "ABC123",
      supplier: "Konsolidator A",
      departAt: hours(24 * 20),
      timeLimitAt: hours(3),
      status: "hold",
      currency: "IDR",
      costPrice: 9800000,
      sellPrice: 10500000,
    },
    {
      code: newBookingCode(),
      customerId: siti.id,
      route: "CGK-CAI",
      airline: "Emirates",
      pnr: "XYZ789",
      supplier: "Konsolidator A",
      departAt: hours(24 * 9),
      status: "issued",
      currency: "IDR",
      costPrice: 11200000,
      sellPrice: 12000000,
      ticketNumbers: "176-0000000001",
    },
  ])
  .returning();

await db.insert(schema.bookingPassengers).values([
  { bookingId: b1.id, passengerId: pAhmad.id },
  { bookingId: b2.id, passengerId: pSiti.id },
]);

const [v1] = await db
  .insert(schema.voaOrders)
  .values({
    code: newVoaCode(),
    customerId: budi.id,
    pax: 2,
    rateUsd: 185,
    totalUsd: 370,
    status: "dp",
    docsPassport: true,
    docsTicket: true,
    dpAt: hours(-30),
    arrivalAt: hours(24 * 6),
    airline: "EgyptAir",
    flightNo: "MS 961",
    terminal: "T3",
  })
  .returning();
await db.insert(schema.voaPassengers).values([
  { voaId: v1.id, passengerId: pBudi1.id },
  { voaId: v1.id, passengerId: pBudi2.id },
]);

await db.insert(schema.payments).values([
  { voaId: v1.id, kind: "dp", method: "transfer", currency: "USD", amount: 185, receiptToken: newToken() },
  { bookingId: b2.id, kind: "penuh", method: "tunai", currency: "EGP", amount: 36000, receivedBy: "owner", receiptToken: newToken() },
]);

console.log("Seed selesai: 3 customer, 1 request, 2 booking, 1 order VOA.");
process.exit(0);
