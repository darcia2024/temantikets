import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Logo } from "@/components/logo";
import { fmtMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Kwitansi", robots: { index: false } };

const kindLabel: Record<string, string> = { dp: "DP 50%", pelunasan: "Pelunasan", penuh: "Pembayaran lunas", refund: "Refund" };
const methodLabel: Record<string, string> = { transfer: "Transfer bank", tunai: "Tunai", gateway: "Pembayaran online" };

export default async function KwitansiPage({ params }: PageProps<"/kwitansi/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const db = await getDb();
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.receiptToken, token) });
  if (!p) notFound();
  const order = p.bookingId
    ? await db.query.bookings.findFirst({ where: eq(schema.bookings.id, p.bookingId) })
    : await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, p.voaId!) });
  const customer = order ? await db.query.customers.findFirst({ where: eq(schema.customers.id, order.customerId) }) : null;
  const desc = p.bookingId && order && "route" in order ? `Tiket ${order.route}${order.airline ? `, ${order.airline}` : ""}` : "VOA Mesir Express";

  return (
    <main className="mx-auto max-w-md px-4 py-8 print:py-0">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <Logo size={34} />
          <p className="font-display text-2xl font-extrabold uppercase italic text-brand-700">Kwitansi</p>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">No.</dt>
            <dd className="font-mono">KW-{String(p.id).padStart(5, "0")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Tanggal</dt>
            <dd>{fmtDateTime(p.receivedAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Diterima dari</dt>
            <dd>{customer?.name ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Untuk</dt>
            <dd className="text-right">
              {desc}
              <br />
              <span className="font-mono text-xs text-gray-500">{order?.code}</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Keterangan</dt>
            <dd>
              {kindLabel[p.kind]} · {methodLabel[p.method]}
            </dd>
          </div>
        </dl>
        <div className="mt-5 rounded-xl bg-brand-50 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Jumlah</p>
          <p className="text-2xl font-bold">{fmtMoney(p.amount, p.currency)}</p>
        </div>
        <p className="mt-5 text-center text-xs text-gray-400">Kwitansi digital ini sah tanpa tanda tangan.</p>
      </div>
    </main>
  );
}
