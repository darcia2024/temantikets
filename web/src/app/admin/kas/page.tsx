import Link from "next/link";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Currency } from "@/db/schema";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Field, Input, PageHeader, SectionTitle } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";
import { markDeposited, updateRates } from "./actions";

export const metadata = { title: "Kas" };

export default async function KasPage({ searchParams }: PageProps<"/admin/kas">) {
  const sp = await searchParams;
  const db = await getDb();
  const settings = await getSettings();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [cash, recent] = await Promise.all([
    db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.method, "tunai"), isNull(schema.payments.depositedAt)))
      .orderBy(desc(schema.payments.receivedAt)),
    db.select().from(schema.payments).where(gte(schema.payments.receivedAt, monthStart)).orderBy(desc(schema.payments.receivedAt)),
  ]);

  // Cash currently held, per holder and currency (refunds paid out reduce it).
  const balances = new Map<string, Map<Currency, number>>();
  for (const p of cash) {
    const m = balances.get(p.receivedBy) ?? new Map<Currency, number>();
    m.set(p.currency, (m.get(p.currency) ?? 0) + (p.kind === "refund" ? -p.amount : p.amount));
    balances.set(p.receivedBy, m);
  }
  const toIdr = (amount: number, c: Currency) => (c === "IDR" ? amount : amount * settings.rates[c]);
  const monthIdr = recent.reduce((s, p) => s + (p.kind === "refund" ? -1 : 1) * toIdr(p.amount, p.currency), 0);

  return (
    <>
      <PageHeader title="Kas & pembayaran" back="/admin/lainnya" />
      <Flash sp={sp} />
      <Card>
        <p className="text-xs uppercase tracking-wide text-gray-500">Masuk bulan ini (setara Rupiah)</p>
        <p className="text-2xl font-bold">{fmtMoney(monthIdr, "IDR")}</p>
        <p className="text-xs text-gray-500">
          {recent.length} transaksi · kurs USD {fmtMoney(settings.rates.USD, "IDR")}, EGP {fmtMoney(settings.rates.EGP, "IDR")}
        </p>
      </Card>

      <SectionTitle>Uang tunai yang belum disetor</SectionTitle>
      {cash.length === 0 ? (
        <Empty>Semua uang tunai sudah disetor.</Empty>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[...balances.entries()].map(([holder, m]) => (
              <Card key={holder}>
                <p className="text-sm text-gray-500">{holder}</p>
                {[...m.entries()].map(([c, amt]) => (
                  <p key={c} className="font-semibold">
                    {fmtMoney(amt, c)}
                  </p>
                ))}
              </Card>
            ))}
          </div>
          <Card>
            <form action={markDeposited} className="space-y-2">
              {cash.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="paymentIds" value={p.id} className="h-4 w-4" />
                  <span className="flex-1">
                    {fmtMoney(p.amount, p.currency)} <span className="text-gray-500">· {p.receivedBy} · {fmtDateTime(p.receivedAt)}</span>
                  </span>
                  <Link href={`/kwitansi/${p.receiptToken}`} target="_blank" className="text-xs text-brand-600 underline">
                    kwitansi
                  </Link>
                </label>
              ))}
              <SubmitButton variant="secondary">Tandai sudah disetor</SubmitButton>
            </form>
          </Card>
        </>
      )}

      <SectionTitle>Transaksi bulan ini</SectionTitle>
      {recent.length === 0 ? (
        <Empty>Belum ada transaksi bulan ini.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {recent.map((p) => (
            <Link
              key={p.id}
              href={p.bookingId ? `/admin/tiket/${p.bookingId}` : `/admin/voa/${p.voaId}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
            >
              <span>
                <span className="font-medium">{fmtMoney(p.amount, p.currency)}</span>{" "}
                <span className="text-gray-500">
                  {p.bookingId ? "Tiket" : "VOA"} · {p.method} · {fmtDateTime(p.receivedAt)}
                </span>
              </span>
              <Badge tone={p.kind === "refund" ? "red" : "green"}>{p.kind}</Badge>
            </Link>
          ))}
        </Card>
      )}

      <SectionTitle>Kurs & pemegang kas</SectionTitle>
      <Card>
        <form action={updateRates} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="1 USD = Rp">
              <Input name="USD" inputMode="decimal" defaultValue={settings.rates.USD} />
            </Field>
            <Field label="1 EGP = Rp">
              <Input name="EGP" inputMode="decimal" defaultValue={settings.rates.EGP} />
            </Field>
          </div>
          <Field label="Pemegang kas tunai" hint="Pisahkan dengan koma, misal: owner, Fulan (Kairo)">
            <Input name="cashHolders" defaultValue={settings.cashHolders.join(", ")} />
          </Field>
          <SubmitButton variant="secondary">Simpan</SubmitButton>
        </form>
      </Card>
    </>
  );
}
