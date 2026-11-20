CREATE TABLE "member_logins" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "member_logins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_proofs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"booking_id" bigint,
	"voa_id" bigint,
	"file_id" bigint NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payer_name" text,
	"note" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"payment_id" bigint,
	"reject_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proofs_target_check" CHECK (num_nonnulls(booking_id, voa_id) = 1),
	CONSTRAINT "payment_proofs_status_check" CHECK (status in ('menunggu', 'diterima', 'ditolak')),
	CONSTRAINT "payment_proofs_source_check" CHECK (source in ('member', 'link')),
	CONSTRAINT "payment_proofs_currency_check" CHECK (currency in ('IDR', 'EGP', 'USD')),
	CONSTRAINT "payment_proofs_amount_check" CHECK (amount > 0)
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "point_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"points" integer NOT NULL,
	"booking_id" bigint,
	"voa_id" bigint,
	"referee_id" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_ledger_kind_check" CHECK (kind in ('belanja', 'referral', 'tukar', 'koreksi', 'batal')),
	CONSTRAINT "point_ledger_points_check" CHECK (points <> 0)
);
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pay_token" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referred_by_id" bigint;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "login_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "passenger_id" bigint;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "uploaded_by" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_requests" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "voa_orders" ADD COLUMN "pay_token" text;--> statement-breakpoint
ALTER TABLE "member_logins" ADD CONSTRAINT "member_logins_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_voa_id_voa_orders_id_fk" FOREIGN KEY ("voa_id") REFERENCES "public"."voa_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_voa_id_voa_orders_id_fk" FOREIGN KEY ("voa_id") REFERENCES "public"."voa_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_referee_id_customers_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_logins_token_hash_key" ON "member_logins" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "member_logins_customer_id_idx" ON "member_logins" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_booking_id_idx" ON "payment_proofs" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_voa_id_idx" ON "payment_proofs" USING btree ("voa_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_file_id_idx" ON "payment_proofs" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_payment_id_idx" ON "payment_proofs" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_status_idx" ON "payment_proofs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "point_ledger_customer_id_idx" ON "point_ledger" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "point_ledger_booking_id_idx" ON "point_ledger" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "point_ledger_voa_id_idx" ON "point_ledger" USING btree ("voa_id");--> statement-breakpoint
CREATE INDEX "point_ledger_referee_id_idx" ON "point_ledger" USING btree ("referee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_booking_kind_key" ON "point_ledger" USING btree ("booking_id","kind") WHERE booking_id is not null and kind in ('belanja', 'batal');--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_voa_kind_key" ON "point_ledger" USING btree ("voa_id","kind") WHERE voa_id is not null and kind in ('belanja', 'batal');--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_referee_key" ON "point_ledger" USING btree ("referee_id") WHERE kind = 'referral';--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_id_customers_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_passenger_id_passengers_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_pay_token_key" ON "bookings" USING btree ("pay_token");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_referral_code_key" ON "customers" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "customers_referred_by_id_idx" ON "customers" USING btree ("referred_by_id");--> statement-breakpoint
CREATE INDEX "files_passenger_id_idx" ON "files" USING btree ("passenger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voa_orders_pay_token_key" ON "voa_orders" USING btree ("pay_token");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_kind_check" CHECK (kind in ('tiket', 'otb', 'bukti', 'boarding', 'paspor', 'dokumen', 'lainnya'));--> statement-breakpoint
-- Same as 0001/0003: keep new tables closed to any public data API.
ALTER TABLE "member_logins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_proofs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "point_ledger" ENABLE ROW LEVEL SECURITY;
