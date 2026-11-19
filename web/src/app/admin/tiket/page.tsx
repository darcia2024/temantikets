import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { BookingStatus } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Badge, btn, Card, Empty, PageHeader } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { bookingStatusMeta } from "@/lib/status";
import { fmtCountdown, fmtDepart } from "@/lib/time";

export const metadata = { title: "Tiket" };

const tabs: { key: string; label: string; statuses: BookingStatus[] }[] = [
  { key: "aktif", label: "Aktif", statuses: ["penawaran", "hold", "dibayar", "issued", "perubahan"] },
  { key: "berangkat", label: "Berangkat", statuses: ["berangkat", "selesai"] },
  { key: "batal", label: "Batal", statuses: ["batal"] },
];

export default async function BookingsPage({ searchParams }: PageProps<"/admin/tiket">) {
  const sp = await searchParams;
  const tab = tabs.find((t) => t.key === sp.tab) ?? tabs[0];
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ b: schema.bookings, customerName: schema.customers.name })
    .from(schema.bookings)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(inArray(schema.bookings.status, tab.statuses))
    .orderBy(tab.key === "aktif" ? asc(schema.bookings.departAt) : desc(schema.bookings.departAt))
    .limit(200);

  const order: BookingStatus[] = ["hold", "dibayar", "penawaran", "perubahan", "issued"];
  if (tab.key === "aktif") rows.sort((a, b) => order.indexOf(a.b.status) - order.indexOf(b.b.status));

  return (
    <>
      <PageHeader
        title="Tiket"
        action={
          <Link href="/admin/tiket/baru" className={btn.primary}>
            + Baru
          </Link>
        }
      />
      <Flash sp={sp} />
      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/tiket?tab=${t.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${t.key === tab.key ? "bg-ink text-white" : "bg-white text-gray-600 ring-1 ring-gray-200"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>Tidak ada booking di sini.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map(({ b, customerName }) => {
            const meta = bookingStatusMeta[b.status];
            const urgent = b.status === "hold" && b.timeLimitAt && b.timeLimitAt.getTime() - now.getTime() < 6 * 3600000;
            return (
              <Link key={b.id} href={`/admin/tiket/${b.id}`} className="block">
                <Card className={urgent ? "ring-2 ring-red-400" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{customerName}</p>
                      <p className="text-sm text-gray-600">
                        {b.route} · {b.airline ?? "-"} · {fmtDepart(b)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {b.code} · {fmtMoney(b.sellPrice, b.currency)}
                      </p>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  {b.status === "hold" && b.timeLimitAt && (
                    <p className={`mt-2 text-sm font-semibold ${urgent ? "text-red-700" : "text-amber-800"}`}>
                      Time limit: {fmtCountdown(b.timeLimitAt)}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
