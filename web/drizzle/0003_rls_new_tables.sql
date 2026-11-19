-- Same reasoning as 0001: block Supabase's public API from these tables.
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
