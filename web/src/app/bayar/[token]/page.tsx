import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Logo } from "@/components/logo";
import { BankInfo, ProofForm } from "@/components/proof-form";
import { PublicFlash } from "@/components/public-flash";
import { Badge, Card, Row, SectionTitle, WaButton } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { orderBalance } from "@/lib/payments";
import { publicGuard, submitProof } from "@/lib/proofs";
import { getSettings } from "@/lib/settings";
import { bookingStatusMeta, voaStatusMeta } from "@/lib/status";
import { fmtDateTime, fmtDepart } from "@/lib/time";
import { waLink } from "@/lib/wa";

export const metadata = { title: "Pembayaran", robots: { index: false } };

const TOKEN = /^[A-Za-z0-9_-]{20,40}$/;

async function findOrder(token: string) {
  if (!TOKEN.test(token)) return null;
  const db = await getDb();
  const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.payToken, token) });
  if (b) return { kind: "booking" as const, b };
  const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.payToken, token) });
  if (v) return { kind: "voa" as const, v };
  return null;
}

async function send(token: string, formData: FormData) {
  "use server";
  const back = `/bayar/${token}`;
  await publicGuard(
    back,
    async () => {
      const o = await findOrder(token);
      if (!o) notFound();
      const order = o.kind === "booking" ? { ...o.b, kind: o.kind } : { ...o.v, kind: o.kind };
      await submitProof(order, formData, "link", "link");
    },
    "terkirim",
  );
}

export default async function PayPage({ params, searchParams }: PageProps<"/bayar/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const o = await findOrder(token);
  if (!o) notFound();
  const db = await getDb();
  const settings = await getSettings();
  const customerId = o.kind === "booking" ? o.b.customerId : o.v.customerId;
  const target = o.kind === "booking" ? { bookingId: o.b.id } : { voaId: o.v.id };
  const [customer, balance, proofs] = await Promise.all([
    db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) }),
    orderBalance(target, settings),
    db
      .select()
      .from(schema.paymentProofs)
      .where(o.kind === "booking" ? eq(schema.paymentProofs.bookingId, o.b.id) : eq(schema.paymentProofs.voaId, o.v.id))
      .orderBy(desc(schema.paymentProofs.createdAt))
      .limit(5),
  ]);
  // First name only: this link may be forwarded to family.
  const firstName = customer?.name.split(/\s+/)[0] ?? "";
  const status = o.kind === "booking" ? o.b.status : o.v.status;
  const cancelled = status === "batal";
  const paidOff = balance.due === 0;
  const ownerWa = process.env.OWNER_WA;
  const code = o.kind === "booking" ? o.b.code : o.v.code;

  return (
    <main className="bg-sky-hero min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-md">
        <Logo size={30} />
        <h1 className="mt-6 font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Pembayaran</h1>
        <p className="mt-1 text-sm text-ink/60">
          {o.kind === "booking" ? "Tiket pesawat" : "VOA Mesir Express"} atas nama {firstName}
        </p>
        <div className="mt-4">
          <PublicFlash sp={sp} />
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <p className="font-mono font-semibold">{code}</p>
            <Badge tone={o.kind === "booking" ? bookingStatusMeta[o.b.status].tone : voaStatusMeta[o.v.status].tone}>
              {o.kind === "booking" ? bookingStatusMeta[o.b.status].label : voaStatusMeta[o.v.status].public}
            </Badge>
          </div>
          <dl className="mt-3 divide-y divide-gray-100">
            {o.kind === "booking" ? (
              <>
                <Row label="Rute">{o.b.route}</Row>
                <Row label="Maskapai">{o.b.airline ?? "-"}</Row>
                <Row label="Berangkat">{fmtDepart(o.b)}</Row>
                {o.b.status === "hold" && o.b.timeLimitAt && <Row label="Batas bayar">{fmtDateTime(o.b.timeLimitAt)}</Row>}
              </>
            ) : (
              <Row label="Jumlah">{o.v.pax} orang</Row>
            )}
            <Row label="Total">{fmtMoney(balance.total, balance.currency)}</Row>
            <Row label="Sudah dibayar">{fmtMoney(balance.paid, balance.currency)}</Row>
            <Row label="Sisa">
              <span className={paidOff ? "text-emerald-700" : "text-brand-700"}>{paidOff ? "Lunas" : fmtMoney(balance.due, balance.currency)}</span>
            </Row>
          </dl>
          {o.kind === "voa" && !paidOff && ["konfirmasi", "dokumen"].includes(o.v.status) && balance.total != null && (
            <p className="mt-2 text-xs text-ink/60">DP 50%: {fmtMoney(balance.total / 2, "USD")}. Sisanya dilunasi setelah OK to Board terbit.</p>
          )}
        </Card>

        {proofs.length > 0 && (
          <>
            <SectionTitle>Bukti yang sudah dikirim</SectionTitle>
            <Card className="divide-y divide-gray-100 p-0">
              {proofs.map((p) => (
                <div key={p.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>{fmtMoney(p.amount, p.currency)}</span>
                    <Badge tone={p.status === "diterima" ? "green" : p.status === "ditolak" ? "red" : "amber"}>
                      {p.status === "menunggu" ? "Sedang dicek" : p.status === "diterima" ? "Diterima" : "Ditolak"}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink/55">{fmtDateTime(p.createdAt)}</p>
                  {p.status === "ditolak" && p.rejectReason && <p className="mt-1 text-xs text-red-700">{p.rejectReason}</p>}
                </div>
              ))}
            </Card>
          </>
        )}

        {!cancelled && !paidOff && (
          <>
            <SectionTitle>Bayar</SectionTitle>
            <Card className="space-y-4">
              <BankInfo accounts={settings.bankAccounts} />
              <ProofForm action={send.bind(null, token)} suggested={{ amount: balance.due, currency: balance.currency }} />
            </Card>
          </>
        )}

        {ownerWa && (
          <div className="mt-6 text-center">
            <WaButton href={waLink(ownerWa, `Assalamualaikum Temantiket, saya mau tanya pembayaran ${code}.`)}>Tanya lewat WhatsApp</WaButton>
          </div>
        )}
      </div>
    </main>
  );
}