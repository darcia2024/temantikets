-- The app talks to Postgres only from the server, with its own connection.
-- On Supabase, enabling RLS with no policies blocks the public anon/authenticated
-- API (PostgREST) from reading these tables, including passport data.
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "passengers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_passengers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voa_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voa_passengers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sent_alerts" ENABLE ROW LEVEL SECURITY;
