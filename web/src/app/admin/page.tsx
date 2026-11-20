import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Logo } from "@/components/logo";
import { PushToggle } from "@/components/push-toggle";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { voaStatusMeta } from "@/lib/status";
import { supplierBalances } from "@/lib/suppliers";
import { addBusinessDays, fmtCountdown, fmtDateTime, fmtDepart, TZ_CAIRO } from "@/lib/time";

export const metadata = { title: "Hari ini" };

function Item({ href, title, sub, right, danger }: { href: string; title: string; sub: string; right?: React.ReactNode; danger?: boolean }) {
  return (
    <Link href={href} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 ${danger ? "bg-red-50" : ""}`}>
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-sm text-gray-500">{sub}</p>
      </div>
      {right}
    </Link>
  );
}

export default async function TodayPage() {
  const db = await getDb();
  const now = new Date();
  const in3d = new Date(now.getTime() + 3 * 86400000);

  const [holds, requests, voas, departures, cash] = await Promise.all([
    db
      .select({ b: schema.bookings, name: schema.customers.name })
      .from(schema.bookings)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
      .where(eq(schema.bookings.status, "hold"))
      .orderBy(asc(schema.bookings.timeLimitAt)),
    db.select().from(schema.ticketRequests).where(eq(schema.ticketRequests.status, "baru")).orderBy(asc(schema.ticketRequests.createdAt)),
    db
      .select({ v: schema.voaOrders, name: schema.customers.name })
      .from(schema.voaOrders)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.voaOrders.customerId))
      .where(inArray(schema.voaOrders.status, ["konfirmasi", "dokumen", "dp", "otb_terbit", "lunas"]))
      .orderBy(asc(schema.voaOrders.arrivalAt)),
    db
      .select({ b: schema.bookings, name: schema.customers.name })
      .from(schema.bookings)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
      .where(and(inArray(schema.bookings.status, ["issued", "dibayar"]), gte(schema.bookings.departAt, now), lte(schema.bookings.departAt, in3d)))
      .orderBy(asc(schema.bookings.departAt)),
    db.select().from(schema.payments).where(and(eq(schema.payments.method, "tunai"), isNull(schema.payments.depositedAt))),
  ]);

  const [suppliers, balances, openChanges] = await Promise.all([
    db.select().from(schema.suppliers).where(eq(schema.suppliers.active, true)),
    supplierBalances(),
    db
      .select({ c: schema.bookingChanges, code: schema.bookings.code, name: schema.customers.name })
      .from(schema.bookingChanges)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.bookingChanges.bookingId))
      .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
      .where(inArray(schema.bookingChanges.status, ["diajukan", "diproses"]))
      .orderBy(asc(schema.bookingChanges.createdAt)),
  ]);
  const lowSuppliers = suppliers.filter((s) => s.lowBalance != null && (balances.get(s.id) ?? 0) < s.lowBalance);

  const proofs = await db
    .select({ p: schema.paymentProofs, bookingCode: schema.bookings.code, voaCode: schema.voaOrders.code })
    .from(schema.paymentProofs)
    .leftJoin(schema.bookings, eq(schema.bookings.id, schema.paymentProofs.bookingId))
    .leftJoin(schema.voaOrders, eq(schema.voaOrders.id, schema.paymentProofs.voaId))
    .where(eq(schema.paymentProofs.status, "menunggu"))
    .orderBy(asc(schema.paymentProofs.createdAt));

  const paidNotIssued = await db
    .select({ b: schema.bookings, name: schema.customers.name })
    .from(schema.bookings)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(eq(schema.bookings.status, "dibayar"));

  const voaAction: Record<string, string> = {
    konfirmasi: "Minta paspor + tiket PP",
    dokumen: "Tagih DP 50%",
    dp: "Proses OK to Board",
    otb_terbit: "Kirim OTB + tagih pelunasan",
    lunas: "Siapkan Mandub",
  };
  const cashCount = cash.length;
  const nothing =
    holds.length + requests.length + voas.length + departures.length + paidNotIssued.length + openChanges.length + lowSuppliers.length + proofs.length ===
    0;

  return (
    <>
      <header className="-mx-4 -mt-5 mb-4 rounded-b-3xl bg-gradient-to-br from-brand-500 to-sky-brand px-5 pb-6 pt-5 text-white">
        <Logo tone="white" size={30} />
        <p className="mt-5 text-sm text-white/80">
          {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long" }).format(now)}
        </p>
        <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight">Hari ini</h1>
      </header>
      <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />

      {nothing && <Card className="mt-4 text-center text-sm text-gray-500">Tidak ada yang mendesak. Alhamdulillah.</Card>}

      {holds.length > 0 && (
        <>
          <SectionTitle>Time limit HOLD ({holds.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {holds.map(({ b, name }) => {
              const left = b.timeLimitAt ? b.timeLimitAt.getTime() - now.getTime() : Infinity;
              return (
                <Item
                  key={b.id}
                  href={`/admin/tiket/${b.id}`}
                  title={name}
                  sub={`${b.route} · ${b.airline ?? "-"} · ${fmtMoney(b.sellPrice, b.currency)}`}
                  danger={left < 2 * 3600000}
                  right={
                    <span className={`shrink-0 text-right text-sm font-semibold ${left < 6 * 3600000 ? "text-red-700" : "text-amber-800"}`}>
                      {fmtCountdown(b.timeLimitAt, now)}
                    </span>
                  }
                />
              );
            })}
          </Card>
        </>
      )}

      {proofs.length > 0 && (
        <>
          <SectionTitle>Bukti transfer perlu dicek ({proofs.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {proofs.map(({ p, bookingCode, voaCode }) => (
              <Item
                key={p.id}
                href={p.bookingId ? `/admin/tiket/${p.bookingId}` : `/admin/voa/${p.voaId}`}
                title={`${bookingCode ?? voaCode} · ${fmtMoney(p.amount, p.currency)}`}
                sub={`${p.payerName ?? "Tanpa nama"} · ${fmtDateTime(p.createdAt)}`}
                right={<Badge tone="amber">Cek</Badge>}
              />
            ))}
          </Card>
        </>
      )}

      {paidNotIssued.length > 0 && (
        <>
          <SectionTitle>Sudah bayar, belum issued ({paidNotIssued.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {paidNotIssued.map(({ b, name }) => (
              <Item key={b.id} href={`/admin/tiket/${b.id}`} title={name} sub={`${b.code} · ${b.route} · ${b.airline ?? "-"}`} right={<Badge tone="blue">Issue</Badge>} />
            ))}
          </Card>
        </>
      )}

      {lowSuppliers.length > 0 && (
        <>
          <SectionTitle>Deposit supplier menipis</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {lowSuppliers.map((s) => (
              <Item
                key={s.id}
                href={`/admin/supplier/${s.id}`}
                title={s.name}
                sub={`Batas ${fmtMoney(s.lowBalance, s.currency)}`}
                danger
                right={<span className="shrink-0 text-sm font-semibold text-red-700">{fmtMoney(balances.get(s.id) ?? 0, s.currency)}</span>}
              />
            ))}
          </Card>
        </>
      )}

      {openChanges.length > 0 && (
        <>
          <SectionTitle>Reschedule / refund berjalan ({openChanges.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {openChanges.map(({ c, code, name }) => (
              <Item
                key={c.id}
                href={`/admin/tiket/${c.bookingId}`}
                title={name}
                sub={`${code} · ${c.kind}${c.reason ? ` · ${c.reason}` : ""}`}
                right={<Badge tone={c.status === "diajukan" ? "amber" : "blue"}>{c.status}</Badge>}
              />
            ))}
          </Card>
        </>
      )}

      {requests.length > 0 && (
        <>
          <SectionTitle>Request baru dari website ({requests.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {requests.map((r) => (
              <Item key={r.id} href="/admin/request" title={r.name} sub={`${r.route} · ${r.pax} orang · ${r.code}`} right={<Badge tone="amber">Baru</Badge>} />
            ))}
          </Card>
        </>
      )}

      {voas.length > 0 && (
        <>
          <SectionTitle>VOA perlu tindakan ({voas.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {voas.map(({ v, name }) => {
              const tight =
                v.arrivalAt &&
                ((v.status === "dp" && v.dpAt && v.arrivalAt < addBusinessDays(v.dpAt, 4)) ||
                  (["konfirmasi", "dokumen"].includes(v.status) && v.arrivalAt < addBusinessDays(now, 4)));
              return (
                <Item
                  key={v.id}
                  href={`/admin/voa/${v.id}`}
                  title={name}
                  sub={`${voaAction[v.status]} · tiba ${fmtDateTime(v.arrivalAt, TZ_CAIRO)}`}
                  danger={!!tight}
                  right={<Badge tone={voaStatusMeta[v.status].tone}>{voaStatusMeta[v.status].label}</Badge>}
                />
              );
            })}
          </Card>
        </>
      )}

      {departures.length > 0 && (
        <>
          <SectionTitle>Berangkat 3 hari ke depan ({departures.length})</SectionTitle>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0">
            {departures.map(({ b, name }) => (
              <Item key={b.id} href={`/admin/tiket/${b.id}`} title={name} sub={`${b.route} · ${fmtDepart(b)}`} right={<Badge tone="violet">Reminder</Badge>} />
            ))}
          </Card>
        </>
      )}

      {cashCount > 0 && (
        <Link href="/admin/kas" className="mt-6 block rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          {cashCount} penerimaan tunai belum ditandai disetor →
        </Link>
      )}
    </>
  );
}
