import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const fk = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const createdAt = () => ts("created_at").notNull().defaultNow();

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

export const BOOKING_STATUS = [
  "penawaran",
  "hold",
  "dibayar",
  "issued",
  "berangkat",
  "selesai",
  "perubahan",
  "batal",
] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];

export const VOA_STATUS = [
  "konfirmasi",
  "dokumen",
  "dp",
  "otb_terbit",
  "lunas",
  "dijemput",
  "selesai",
  "batal",
] as const;
export type VoaStatus = (typeof VOA_STATUS)[number];

export const MANDUB_STATUS = ["belum", "menunggu_gate", "voa_beres", "keluar"] as const;
export type MandubStatus = (typeof MANDUB_STATUS)[number];

export const CURRENCIES = ["IDR", "EGP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

const inList = (col: string, values: readonly string[]) =>
  sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(", ")})`);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    // WhatsApp number normalised to international digits, e.g. 6281234567890
    wa: text("wa").notNull(),
    waParent: text("wa_parent"),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customers_wa_key").on(t.wa)],
);

export const passengers = pgTable(
  "passengers",
  {
    id: id(),
    customerId: fk("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    passportNo: text("passport_no"),
    birthDate: date("birth_date"),
    passportExpiry: date("passport_expiry"),
    isStudent: boolean("is_student").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("passengers_customer_id_idx").on(t.customerId)],
);

export const ticketRequests = pgTable(
  "ticket_requests",
  {
    id: id(),
    code: text("code").notNull(),
    customerId: fk("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    wa: text("wa").notNull(),
    route: text("route").notNull(),
    departDate: date("depart_date").notNull(),
    returnDate: date("return_date"),
    flexDays: integer("flex_days").notNull().default(0),
    pax: integer("pax").notNull().default(1),
    priority: text("priority").notNull().default("termurah"),
    wantsVoa: boolean("wants_voa").notNull().default(false),
    notes: text("notes"),
    status: text("status").notNull().default("baru"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ticket_requests_code_key").on(t.code),
    index("ticket_requests_customer_id_idx").on(t.customerId),
    index("ticket_requests_status_idx").on(t.status),
    check("ticket_requests_status_check", inList("status", ["baru", "diproses", "selesai", "batal"])),
    check("ticket_requests_pax_check", sql`pax between 1 and 99`),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    code: text("code").notNull(),
    customerId: fk("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    requestId: fk("request_id").references(() => ticketRequests.id, { onDelete: "set null" }),
    route: text("route").notNull(),
    airline: text("airline"),
    pnr: text("pnr"),
    // Free-text label kept for older rows; supplierId drives the deposit ledger.
    supplier: text("supplier"),
    supplierId: fk("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    departAt: ts("depart_at"),
    timeLimitAt: ts("time_limit_at"),
    status: text("status").$type<BookingStatus>().notNull().default("penawaran"),
    currency: text("currency").$type<Currency>().notNull().default("IDR"),
    costPrice: money("cost_price"),
    sellPrice: money("sell_price"),
    ticketNumbers: text("ticket_numbers"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_code_key").on(t.code),
    index("bookings_customer_id_idx").on(t.customerId),
    index("bookings_request_id_idx").on(t.requestId),
    index("bookings_supplier_id_idx").on(t.supplierId),
    index("bookings_status_time_limit_idx").on(t.status, t.timeLimitAt),
    check("bookings_status_check", inList("status", BOOKING_STATUS)),
    check("bookings_currency_check", inList("currency", CURRENCIES)),
  ],
);

export const bookingPassengers = pgTable(
  "booking_passengers",
  {
    bookingId: fk("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    passengerId: fk("passenger_id")
      .notNull()
      .references(() => passengers.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.passengerId] }),
    index("booking_passengers_passenger_id_idx").on(t.passengerId),
  ],
);

export const voaOrders = pgTable(
  "voa_orders",
  {
    id: id(),
    code: text("code").notNull(),
    customerId: fk("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    bookingId: fk("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    pax: integer("pax").notNull().default(1),
    rateUsd: money("rate_usd"),
    totalUsd: money("total_usd"),
    status: text("status").$type<VoaStatus>().notNull().default("konfirmasi"),
    arrivalAt: ts("arrival_at"),
    airline: text("airline"),
    flightNo: text("flight_no"),
    terminal: text("terminal"),
    docsPassport: boolean("docs_passport").notNull().default(false),
    docsTicket: boolean("docs_ticket").notNull().default(false),
    dpAt: ts("dp_at"),
    otbIssuedAt: ts("otb_issued_at"),
    mandubStatus: text("mandub_status").$type<MandubStatus>().notNull().default("belum"),
    mandubNote: text("mandub_note"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("voa_orders_code_key").on(t.code),
    index("voa_orders_customer_id_idx").on(t.customerId),
    index("voa_orders_booking_id_idx").on(t.bookingId),
    index("voa_orders_arrival_at_idx").on(t.arrivalAt),
    check("voa_orders_status_check", inList("status", VOA_STATUS)),
    check("voa_orders_mandub_status_check", inList("mandub_status", MANDUB_STATUS)),
    check("voa_orders_pax_check", sql`pax between 1 and 200`),
  ],
);

export const voaPassengers = pgTable(
  "voa_passengers",
  {
    voaId: fk("voa_id")
      .notNull()
      .references(() => voaOrders.id, { onDelete: "cascade" }),
    passengerId: fk("passenger_id")
      .notNull()
      .references(() => passengers.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.voaId, t.passengerId] }),
    index("voa_passengers_passenger_id_idx").on(t.passengerId),
  ],
);

// Files are stored in the database for Fase 0 (small PDFs/photos). Move to
// object storage (e.g. Vercel Blob) once volume grows; the `files` API stays the same.
export const files = pgTable(
  "files",
  {
    id: id(),
    kind: text("kind").notNull(),
    bookingId: fk("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    voaId: fk("voa_id").references(() => voaOrders.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    // random token so a file can be shared by link (e.g. to WhatsApp)
    shareToken: text("share_token").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("files_share_token_key").on(t.shareToken),
    index("files_booking_id_idx").on(t.bookingId),
    index("files_voa_id_idx").on(t.voaId),
    check("files_kind_check", inList("kind", ["tiket", "otb", "bukti", "boarding", "lainnya"])),
    check("files_size_check", sql`size <= 10485760`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: fk("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
    voaId: fk("voa_id").references(() => voaOrders.id, { onDelete: "restrict" }),
    kind: text("kind").notNull().default("penuh"),
    method: text("method").notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    amount: money("amount").notNull(),
    receivedBy: text("received_by").notNull().default("owner"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    depositedAt: ts("deposited_at"),
    receiptToken: text("receipt_token").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_receipt_token_key").on(t.receiptToken),
    index("payments_booking_id_idx").on(t.bookingId),
    index("payments_voa_id_idx").on(t.voaId),
    check("payments_target_check", sql`num_nonnulls(booking_id, voa_id) = 1`),
    check("payments_kind_check", inList("kind", ["dp", "pelunasan", "penuh", "refund"])),
    check("payments_method_check", inList("method", ["transfer", "tunai", "gateway"])),
    check("payments_currency_check", inList("currency", CURRENCIES)),
    check("payments_amount_check", sql`amount > 0`),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_key").on(t.endpoint)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("konsolidator"),
    currency: text("currency").$type<Currency>().notNull().default("IDR"),
    // Warn on the dashboard when the deposit drops below this.
    lowBalance: money("low_balance"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("suppliers_name_key").on(t.name),
    check("suppliers_kind_check", inList("kind", ["konsolidator", "agen", "maskapai", "lainnya"])),
    check("suppliers_currency_check", inList("currency", CURRENCIES)),
  ],
);

export const SUPPLIER_ENTRY = ["topup", "potong", "refund", "koreksi"] as const;

// Deposit movements. amount is signed: positive raises the balance.
export const supplierLedger = pgTable(
  "supplier_ledger",
  {
    id: id(),
    supplierId: fk("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    bookingId: fk("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    amount: money("amount").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("supplier_ledger_supplier_id_idx").on(t.supplierId),
    index("supplier_ledger_booking_id_idx").on(t.bookingId),
    // A booking is charged against the deposit at most once.
    uniqueIndex("supplier_ledger_booking_charge_key").on(t.bookingId).where(sql`kind = 'potong'`),
    check("supplier_ledger_kind_check", inList("kind", SUPPLIER_ENTRY)),
    check("supplier_ledger_amount_check", sql`amount <> 0`),
  ],
);

export const CHANGE_KIND = ["reschedule", "refund", "ganti_nama", "lainnya"] as const;
export const CHANGE_STATUS = ["diajukan", "diproses", "selesai", "batal"] as const;

export const bookingChanges = pgTable(
  "booking_changes",
  {
    id: id(),
    bookingId: fk("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("diajukan"),
    oldDepartAt: ts("old_depart_at"),
    newDepartAt: ts("new_depart_at"),
    currency: text("currency").$type<Currency>().notNull().default("IDR"),
    // What the airline/supplier charges us
    airlineFee: money("airline_fee"),
    // Temantiket service fee charged to the customer
    serviceFee: money("service_fee"),
    // Amount returned to the customer (refunds)
    refundAmount: money("refund_amount"),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("booking_changes_booking_id_idx").on(t.bookingId),
    check("booking_changes_kind_check", inList("kind", CHANGE_KIND)),
    check("booking_changes_status_check", inList("status", CHANGE_STATUS)),
    check("booking_changes_currency_check", inList("currency", CURRENCIES)),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actor: text("actor").notNull(),
    entity: text("entity").notNull(),
    entityId: bigint("entity_id", { mode: "number" }),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

// Dedupe for reminders so a cron run never sends the same alert twice.
export const sentAlerts = pgTable(
  "sent_alerts",
  {
    key: text("key").primaryKey(),
    createdAt: createdAt(),
  },
);
