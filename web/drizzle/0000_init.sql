CREATE TABLE "booking_passengers" (
	"booking_id" bigint NOT NULL,
	"passenger_id" bigint NOT NULL,
	CONSTRAINT "booking_passengers_booking_id_passenger_id_pk" PRIMARY KEY("booking_id","passenger_id")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bookings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"customer_id" bigint NOT NULL,
	"request_id" bigint,
	"route" text NOT NULL,
	"airline" text,
	"pnr" text,
	"supplier" text,
	"depart_at" timestamp with time zone,
	"time_limit_at" timestamp with time zone,
	"status" text DEFAULT 'penawaran' NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"cost_price" numeric(14, 2),
	"sell_price" numeric(14, 2),
	"ticket_numbers" text,
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status_check" CHECK (status in ('penawaran', 'hold', 'dibayar', 'issued', 'berangkat', 'selesai', 'perubahan', 'batal')),
	CONSTRAINT "bookings_currency_check" CHECK (currency in ('IDR', 'EGP', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"wa" text NOT NULL,
	"wa_parent" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"booking_id" bigint,
	"voa_id" bigint,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"share_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_kind_check" CHECK (kind in ('tiket', 'otb', 'bukti', 'boarding', 'lainnya')),
	CONSTRAINT "files_size_check" CHECK (size <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "passengers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "passengers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"passport_no" text,
	"birth_date" date,
	"passport_expiry" date,
	"is_student" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"booking_id" bigint,
	"voa_id" bigint,
	"kind" text DEFAULT 'penuh' NOT NULL,
	"method" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"received_by" text DEFAULT 'owner' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deposited_at" timestamp with time zone,
	"receipt_token" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_target_check" CHECK (num_nonnulls(booking_id, voa_id) = 1),
	CONSTRAINT "payments_kind_check" CHECK (kind in ('dp', 'pelunasan', 'penuh', 'refund')),
	CONSTRAINT "payments_method_check" CHECK (method in ('transfer', 'tunai', 'gateway')),
	CONSTRAINT "payments_currency_check" CHECK (currency in ('IDR', 'EGP', 'USD')),
	CONSTRAINT "payments_amount_check" CHECK (amount > 0)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"customer_id" bigint,
	"name" text NOT NULL,
	"wa" text NOT NULL,
	"route" text NOT NULL,
	"depart_date" date NOT NULL,
	"return_date" date,
	"flex_days" integer DEFAULT 0 NOT NULL,
	"pax" integer DEFAULT 1 NOT NULL,
	"priority" text DEFAULT 'termurah' NOT NULL,
	"wants_voa" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" text DEFAULT 'baru' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_requests_status_check" CHECK (status in ('baru', 'diproses', 'selesai', 'batal')),
	CONSTRAINT "ticket_requests_pax_check" CHECK (pax between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "voa_orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "voa_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"customer_id" bigint NOT NULL,
	"booking_id" bigint,
	"pax" integer DEFAULT 1 NOT NULL,
	"rate_usd" numeric(14, 2),
	"total_usd" numeric(14, 2),
	"status" text DEFAULT 'konfirmasi' NOT NULL,
	"arrival_at" timestamp with time zone,
	"airline" text,
	"flight_no" text,
	"terminal" text,
	"docs_passport" boolean DEFAULT false NOT NULL,
	"docs_ticket" boolean DEFAULT false NOT NULL,
	"dp_at" timestamp with time zone,
	"otb_issued_at" timestamp with time zone,
	"mandub_status" text DEFAULT 'belum' NOT NULL,
	"mandub_note" text,
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voa_orders_status_check" CHECK (status in ('konfirmasi', 'dokumen', 'dp', 'otb_terbit', 'lunas', 'dijemput', 'selesai', 'batal')),
	CONSTRAINT "voa_orders_mandub_status_check" CHECK (mandub_status in ('belum', 'menunggu_gate', 'voa_beres', 'keluar')),
	CONSTRAINT "voa_orders_pax_check" CHECK (pax between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "voa_passengers" (
	"voa_id" bigint NOT NULL,
	"passenger_id" bigint NOT NULL,
	CONSTRAINT "voa_passengers_voa_id_passenger_id_pk" PRIMARY KEY("voa_id","passenger_id")
);
--> statement-breakpoint
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_passenger_id_passengers_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_request_id_ticket_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ticket_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_voa_id_voa_orders_id_fk" FOREIGN KEY ("voa_id") REFERENCES "public"."voa_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voa_id_voa_orders_id_fk" FOREIGN KEY ("voa_id") REFERENCES "public"."voa_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_requests" ADD CONSTRAINT "ticket_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voa_orders" ADD CONSTRAINT "voa_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voa_orders" ADD CONSTRAINT "voa_orders_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voa_passengers" ADD CONSTRAINT "voa_passengers_voa_id_voa_orders_id_fk" FOREIGN KEY ("voa_id") REFERENCES "public"."voa_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voa_passengers" ADD CONSTRAINT "voa_passengers_passenger_id_passengers_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_passengers_passenger_id_idx" ON "booking_passengers" USING btree ("passenger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "bookings_customer_id_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_request_id_idx" ON "bookings" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "bookings_status_time_limit_idx" ON "bookings" USING btree ("status","time_limit_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_wa_key" ON "customers" USING btree ("wa");--> statement-breakpoint
CREATE UNIQUE INDEX "files_share_token_key" ON "files" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "files_booking_id_idx" ON "files" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "files_voa_id_idx" ON "files" USING btree ("voa_id");--> statement-breakpoint
CREATE INDEX "passengers_customer_id_idx" ON "passengers" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_token_key" ON "payments" USING btree ("receipt_token");--> statement-breakpoint
CREATE INDEX "payments_booking_id_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_voa_id_idx" ON "payments" USING btree ("voa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_requests_code_key" ON "ticket_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ticket_requests_customer_id_idx" ON "ticket_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ticket_requests_status_idx" ON "ticket_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "voa_orders_code_key" ON "voa_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "voa_orders_customer_id_idx" ON "voa_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "voa_orders_booking_id_idx" ON "voa_orders" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "voa_orders_arrival_at_idx" ON "voa_orders" USING btree ("arrival_at");--> statement-breakpoint
CREATE INDEX "voa_passengers_passenger_id_idx" ON "voa_passengers" USING btree ("passenger_id");