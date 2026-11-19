import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { VoaStatus } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Badge, btn, Card, Empty, PageHeader } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { voaStatusMeta } from "@/lib/status";
import { fmtDateTime, TZ_CAIRO } from "@/lib/time";

export const metadata = { title: "VOA" };

const tabs: { key: string; label: string; statuses: VoaStatus[] }[] = [
  { key: "aktif", label: "Aktif", statuses: ["konfirmasi", "dokumen", "dp", "otb_terbit", "lunas", "dijemput"] },
  { key: "selesai", label: "Selesai", statuses: ["selesai"] },
  { key: "batal", label: "Batal", statuses: ["batal"] },
];

export default async function VoaListPage({ searchParams }: PageProps<"/admin/voa">) {
  const sp = await searchParams;
  const tab = tabs.find((t) => t.key === sp.tab) ?? tabs[0];
  const db = await getDb();
  const rows = await db
    .select({ v: schema.voaOrders, customerName: schema.customers.name })
    .from(schema.voaOrders)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.voaOrders.customerId))
    .where(inArray(schema.voaOrders.status, tab.statuses))
    .orderBy(tab.key === "aktif" ? asc(schema.voaOrders.arrivalAt) : desc(schema.voaOrders.arrivalAt))
    .limit(200);

  return (
    <>
      <PageHeader
        title="VOA Mesir Express"
        action={
          <Link href="/admin/voa/baru" className={btn.primary}>
            + Baru
          </Link>
        }
      />
      <Flash sp={sp} />
      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/voa?tab=${t.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${t.key === tab.key ? "bg-ink text-white" : "bg-white text-gray-600 ring-1 ring-gray-200"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>Tidak ada order di sini.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map(({ v, customerName }) => (
            <Link key={v.id} href={`/admin/voa/${v.id}`} className="block">
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{customerName}</p>
                    <p className="text-sm text-gray-600">
                      {v.pax} orang · {v.flightNo ?? "-"} · tiba {fmtDateTime(v.arrivalAt, TZ_CAIRO)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {v.code} · {fmtMoney(v.totalUsd, "USD")}
                    </p>
                  </div>
                  <Badge tone={voaStatusMeta[v.status].tone}>{voaStatusMeta[v.status].label}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
