import Link from "next/link";
import { and, gte, lt, max, ne, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { Card, Empty, PageHeader, SectionTitle, WaButton } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { displayWa } from "@/lib/phone";
import { cancelReasons, monthRange, salesByAirline, shiftMonth, SOLD } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { convert } from "@/lib/suppliers";
import { fmtDate } from "@/lib/time";
import { waLink } from "@/lib/wa";

export const metadata = { title: "Laporan" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </Card>
  );
}

export default async function ReportPage({ searchParams }: PageProps<"/admin/laporan">) {
  const sp = await searchParams;
  const { start, end, ym } = monthRange(typeof sp.bulan === "string" ? sp.bulan : undefined);
  const db = await getDb();
  const settings = await getSettings();
  const inMonth = (col: PgColumn) => and(gte(col, start), lt(col, end));

  const [bookings, voas, payments, requests, lastActivity] = await Promise.all([
    db
      .select({
        airline: schema.bookings.airline,
        status: schema.bookings.status,
        currency: schema.bookings.currency,
        sellPrice: schema.bookings.sellPrice,
        costPrice: schema.bookings.costPrice,
        cancelReason: schema.bookings.cancelReason,
        requestId: schema.bookings.requestId,
      })
      .from(schema.bookings)
      .where(inMonth(schema.bookings.createdAt)),
    db
      .select({ status: schema.voaOrders.status, totalUsd: schema.voaOrders.totalUsd, pax: schema.voaOrders.pax })
      .from(schema.voaOrders)
      .where(and(inMonth(schema.voaOrders.createdAt), ne(schema.voaOrders.status, "batal"))),
    db
      .select({ kind: schema.payments.kind, method: schema.payments.method, currency: schema.payments.currency, amount: schema.payments.amount })
      .from(schema.payments)
      .where(and(gte(schema.payments.receivedAt, start), lt(schema.payments.receivedAt, end))),
    db.select({ id: schema.ticketRequests.id }).from(schema.ticketRequests).where(inMonth(schema.ticketRequests.createdAt)),
    // Latest booking/VOA per customer, for "belum repeat order".
    db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        wa: schema.customers.wa,
        lastBooking: max(schema.bookings.createdAt),
        lastVoa: sql<Date | null>`max(${schema.voaOrders.createdAt})`,
      })
      .from(schema.customers)
      .leftJoin(schema.bookings, sql`${schema.bookings.customerId} = ${schema.customers.id} and ${schema.bookings.status} <> 'batal'`)
      .leftJoin(schema.voaOrders, sql`${schema.voaOrders.customerId} = ${schema.customers.id} and ${schema.voaOrders.status} <> 'batal'`)
      .groupBy(schema.customers.id),
  ]);

  const airlines = salesByAirline(bookings, settings.rates);
  const ticketRevenue = airlines.reduce((s, a) => s + a.revenueIdr, 0);
  const ticketMargin = airlines.reduce((s, a) => s + a.marginIdr, 0);
  const tickets = airlines.reduce((s, a) => s + a.tickets, 0);
  const missingCost = airlines.reduce((s, a) => s + a.missingCost, 0);
  const voaUsd = voas.reduce((s, v) => s + (v.totalUsd ?? 0), 0);
  const voaPax = voas.reduce((s, v) => s + v.pax, 0);
  const cashIn = payments.reduce((s, p) => s + (p.kind === "refund" ? -1 : 1) * convert(p.amount, p.currency, "IDR", settings.rates), 0);
  const byMethod = new Map<string, number>();
  for (const p of payments) {
    const k = `${p.method} ${p.currency}`;
    byMethod.set(k, (byMethod.get(k) ?? 0) + (p.kind === "refund" ? -p.amount : p.amount));
  }
  const reqIds = new Set(requests.map((r) => r.id));
  const converted = new Set(bookings.filter((b) => b.requestId && reqIds.has(b.requestId) && SOLD.includes(b.status)).map((b) => b.requestId));
  const reasons = cancelReasons(bookings);

  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const dormant = lastActivity
    .map((c) => {
      const dates = [c.lastBooking, c.lastVoa].filter(Boolean).map((d) => new Date(d as unknown as string));
      const last = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
      return { ...c, last };
    })
    .filter((c) => c.last && c.last < yearAgo)
    .sort((a, b) => a.last!.getTime() - b.last!.getTime())
    .slice(0, 50);

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`));

  return (
    <>
      <PageHeader title="Laporan" back="/admin/lainnya" />
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
        <Link href={`/admin/laporan?bulan=${shiftMonth(ym, -1)}`} className="rounded-lg px-3 py-2 text-brand-700" aria-label="Bulan sebelumnya">
          ‹
        </Link>
        <p className="font-semibold capitalize">{monthLabel}</p>
        <Link href={`/admin/laporan?bulan=${shiftMonth(ym, 1)}`} className="rounded-lg px-3 py-2 text-brand-700" aria-label="Bulan berikutnya">
          ›
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Tiket terjual" value={String(tickets)} sub={fmtMoney(ticketRevenue, "IDR")} />
        <Stat label="Margin tiket" value={fmtMoney(ticketMargin, "IDR")} sub={missingCost ? `${missingCost} booking tanpa harga modal` : undefined} />
        <Stat label="Order VOA" value={`${voas.length} order · ${voaPax} org`} sub={`${fmtMoney(voaUsd, "USD")} ≈ ${fmtMoney(convert(voaUsd, "USD", "IDR", settings.rates), "IDR")}`} />
        <Stat
          label="Request → terjual"
          value={requests.length ? `${Math.round((converted.size / requests.length) * 100)}%` : "-"}
          sub={`${converted.size} dari ${requests.length} request`}
        />
      </div>
      <p className="mt-2 text-xs text-gray-500">Booking dihitung dari tanggal dibuat. Mata uang lain dikonversi pakai kurs di halaman Kas.</p>

      <SectionTitle>Per maskapai</SectionTitle>
      {airlines.length === 0 ? (
        <Empty>Belum ada tiket terjual bulan ini.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Maskapai</th>
                <th className="px-2 py-2 text-right">Tiket</th>
                <th className="px-2 py-2 text-right">Penjualan</th>
                <th className="px-4 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {airlines.map((a) => (
                <tr key={a.airline}>
                  <td className="px-4 py-2 font-medium">{a.airline}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{a.tickets}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(a.revenueIdr, "IDR")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(a.marginIdr, "IDR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionTitle>Uang masuk ({fmtMoney(cashIn, "IDR")})</SectionTitle>
      {byMethod.size === 0 ? (
        <Empty>Belum ada pembayaran bulan ini.</Empty>
      ) : (
        <Card className="space-y-1 text-sm">
          {[...byMethod.entries()].map(([k, v]) => (
            <p key={k} className="flex justify-between">
              <span className="capitalize text-gray-600">{k}</span>
              <span className="font-medium tabular-nums">{fmtMoney(v, k.split(" ")[1])}</span>
            </p>
          ))}
        </Card>
      )}

      <SectionTitle>Alasan batal</SectionTitle>
      {reasons.length === 0 ? (
        <Empty>Tidak ada booking batal bulan ini.</Empty>
      ) : (
        <Card className="space-y-1 text-sm">
          {reasons.map((r) => (
            <p key={r.reason} className="flex justify-between gap-3">
              <span>{r.reason}</span>
              <span className="font-semibold">{r.count}</span>
            </p>
          ))}
        </Card>
      )}

      <SectionTitle>Belum repeat order lebih dari 12 bulan</SectionTitle>
      {dormant.length === 0 ? (
        <Empty>Tidak ada. Semua customer bertransaksi dalam 12 bulan terakhir.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {dormant.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <Link href={`/admin/customer/${c.id}`} className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {displayWa(c.wa)} · terakhir {fmtDate(c.last)}
                </p>
              </Link>
              <WaButton href={waLink(c.wa, `Assalamualaikum ${c.name}, apa kabar? Temantiket mau info harga tiket Jakarta - Kairo terbaru, mau dicek sekalian?`)}>
                Sapa
              </WaButton>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
