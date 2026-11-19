CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" bigint,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"booking_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'diajukan' NOT NULL,
	"old_depart_at" timestamp with time zone,
	"new_depart_at" timestamp with time zone,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"airline_fee" numeric(14, 2),
	"service_fee" numeric(14, 2),
	"refund_amount" numeric(14, 2),
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_changes_kind_check" CHECK (kind in ('reschedule', 'refund', 'ganti_nama', 'lainnya')),
	CONSTRAINT "booking_changes_status_check" CHECK (status in ('diajukan', 'diproses', 'selesai', 'batal')),
	CONSTRAINT "booking_changes_currency_check" CHECK (currency in ('IDR', 'EGP', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "supplier_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supplier_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"supplier_id" bigint NOT NULL,
	"booking_id" bigint,
	"kind" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_ledger_kind_check" CHECK (kind in ('topup', 'potong', 'refund', 'koreksi')),
	CONSTRAINT "supplier_ledger_amount_check" CHECK (amount <> 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"kind" text DEFAULT 'konsolidator' NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"low_balance" numeric(14, 2),
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_kind_check" CHECK (kind in ('konsolidator', 'agen', 'maskapai', 'lainnya')),
	CONSTRAINT "suppliers_currency_check" CHECK (currency in ('IDR', 'EGP', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "supplier_id" bigint;--> statement-breakpoint
ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "booking_changes_booking_id_idx" ON "booking_changes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "supplier_ledger_supplier_id_idx" ON "supplier_ledger" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_ledger_booking_id_idx" ON "supplier_ledger" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_ledger_booking_charge_key" ON "supplier_ledger" USING btree ("booking_id") WHERE kind = 'potong';--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers" USING btree ("name");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_supplier_id_idx" ON "bookings" USING btree ("supplier_id");