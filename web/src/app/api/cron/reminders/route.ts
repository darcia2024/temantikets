import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { safeEqual } from "@/lib/auth";
import { pushToOwner, type PushPayload } from "@/lib/push";
import { addBusinessDays, fmtCountdown, fmtDateTime, fmtDepart, TZ_CAIRO } from "@/lib/time";

// Run every 15 minutes from a scheduler (cron-job.org, or
// Vercel Cron on a paid plan) with header: Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });

  const db = await getDb();
  const now = new Date();
  const alerts: { key: string; payload: PushPayload }[] = [];

  const holds = await db
    .select({ b: schema.bookings, name: schema.customers.name })
    .from(schema.bookings)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(and(eq(schema.bookings.status, "hold"), lte(schema.bookings.timeLimitAt, new Date(now.getTime() + 6 * 3600000))));
  for (const { b, name } of holds) {
    if (!b.timeLimitAt) continue;
    const left = b.timeLimitAt.getTime() - now.getTime();
    const level = left <= 2 * 3600000 ? "2j" : "6j";
    alerts.push({
      key: `tl:${level}:${b.id}:${b.timeLimitAt.toISOString()}`,
      payload: {
        title: `${left < 0 ? "Time limit LEWAT" : "Time limit"} · ${name}`,
        body: `${b.route} ${b.airline ?? ""} (${b.pnr ?? b.code}) · ${fmtCountdown(b.timeLimitAt, now)}`,
        url: `/admin/tiket/${b.id}`,
        tag: `tl-${b.id}`,
      },
    });
  }

  const voas = await db
    .select({ v: schema.voaOrders, name: schema.customers.name })
    .from(schema.voaOrders)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.voaOrders.customerId))
    .where(inArray(schema.voaOrders.status, ["konfirmasi", "dokumen", "dp", "lunas"]));
  for (const { v, name } of voas) {
    if (!v.arrivalAt) continue;
    const otbDeadline = v.status === "dp" && v.dpAt ? addBusinessDays(v.dpAt, 4) : addBusinessDays(now, 4);
    if (v.status !== "lunas" && v.arrivalAt < otbDeadline) {
      alerts.push({
        key: `otb:${v.id}:${v.status}`,
        payload: {
          title: `OK to Board mepet · ${name}`,
          body: `${v.code} tiba ${fmtDateTime(v.arrivalAt, TZ_CAIRO)}, status masih ${v.status}`,
          url: `/admin/voa/${v.id}`,
        },
      });
    }
    const untilArrival = v.arrivalAt.getTime() - now.getTime();
    if (v.status === "lunas" && untilArrival > 0 && untilArrival < 24 * 3600000) {
      alerts.push({
        key: `arr:${v.id}:${v.arrivalAt.toISOString()}`,
        payload: {
          title: `Besok tiba di Kairo · ${name}`,
          body: `${v.flightNo ?? v.code} ${fmtDateTime(v.arrivalAt, TZ_CAIRO)}. Kirim instruksi hari H dan cek Mandub.`,
          url: `/admin/voa/${v.id}`,
        },
      });
    }
  }

  const departures = await db
    .select({ b: schema.bookings, name: schema.customers.name })
    .from(schema.bookings)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(
      and(
        eq(schema.bookings.status, "issued"),
        gte(schema.bookings.departAt, now),
        lte(schema.bookings.departAt, new Date(now.getTime() + 30 * 3600000)),
      ),
    );
  for (const { b, name } of departures) {
    alerts.push({
      key: `dep:${b.id}:${b.departAt!.toISOString()}`,
      payload: { title: `Berangkat besok · ${name}`, body: `${b.route} ${fmtDepart(b)}. Kirim reminder H-1.`, url: `/admin/tiket/${b.id}` },
    });
  }

  let sent = 0;
  for (const a of alerts) {
    // Insert-first dedupe: only the run that records the key sends the alert.
    const inserted = await db.insert(schema.sentAlerts).values({ key: a.key }).onConflictDoNothing().returning();
    if (inserted.length) sent += (await pushToOwner(a.payload)) > 0 ? 1 : 0;
  }
  return Response.json({ checked: alerts.length, sent });
}
