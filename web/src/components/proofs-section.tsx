import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { acceptProof, rejectProof } from "@/app/admin/kas/actions";
import { fmtMoney } from "@/lib/money";
import { ensurePayToken, orderBalance, type PayTarget } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";
import { appUrl, waLink } from "@/lib/wa";
import { SubmitButton } from "./submit-button";
import { Badge, Card, Input, SectionTitle, Select, WaButton } from "./ui";

/** Pay link + transfer receipts sent by the customer, for the owner to accept or reject. */
export async function ProofsSection({
  target,
  back,
  customer,
  code,
  defaultKind,
}: {
  target: PayTarget;
  back: string;
  customer: { name: string; wa: string; waParent: string | null };
  code: string;
  defaultKind: "dp" | "pelunasan" | "penuh";
}) {
  const db = await getDb();
  const settings = await getSettings();
  const [rows, balance, token] = await Promise.all([
    db
      .select({ p: schema.paymentProofs, shareToken: schema.files.shareToken, filename: schema.files.filename })
      .from(schema.paymentProofs)
      .innerJoin(schema.files, eq(schema.files.id, schema.paymentProofs.fileId))
      .where(target.bookingId ? eq(schema.paymentProofs.bookingId, target.bookingId) : eq(schema.paymentProofs.voaId, target.voaId!))
      .orderBy(desc(schema.paymentProofs.createdAt)),
    orderBalance(target, settings),
    ensurePayToken(target),
  ]);
  const payUrl = appUrl(`/bayar/${token}`);
  const msg = (name: string) =>
    `Assalamualaikum ${name}, berikut link pembayaran ${code} dari Temantiket` +
    (balance.due ? ` (sisa ${fmtMoney(balance.due, balance.currency)})` : "") +
    `:\n${payUrl}\n\nSetelah transfer, upload bukti di link itu ya.\n\nSalam,\nTemantiket`;
  const pending = rows.filter((r) => r.p.status === "menunggu");
  const done = rows.filter((r) => r.p.status !== "menunggu");

  return (
    <>
      <SectionTitle>Link bayar & bukti transfer{pending.length > 0 ? ` (${pending.length} menunggu)` : ""}</SectionTitle>
      <Card className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Sudah dibayar / total</span>
          <span className="font-medium">
            {fmtMoney(balance.paid, balance.currency)} / {fmtMoney(balance.total, balance.currency)}
          </span>
        </div>
        <a href={`/bayar/${token}`} target="_blank" className="block break-all text-xs text-brand-600 underline">
          {payUrl}
        </a>
        <div className="flex flex-wrap gap-2">
          <WaButton href={waLink(customer.wa, msg(customer.name))}>Kirim link bayar</WaButton>
          {customer.waParent && <WaButton href={waLink(customer.waParent, msg("Bapak/Ibu"))}>Ke orang tua</WaButton>}
        </div>

        {pending.map(({ p, shareToken, filename }) => (
          <div key={p.id} className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{fmtMoney(p.amount, p.currency)}</p>
              <Badge tone="amber">Menunggu cek</Badge>
            </div>
            <p className="text-xs text-gray-600">
              {p.payerName ?? "Tanpa nama"} · {p.source === "link" ? "link bayar" : "akun member"} · {fmtDateTime(p.createdAt)}
            </p>
            {p.note && <p className="mt-1 text-xs">{p.note}</p>}
            <a href={`/f/${shareToken}`} target="_blank" className="mt-1 inline-block text-xs font-semibold text-brand-600 underline">
              Lihat bukti: {filename}
            </a>
            <p className="mt-1 text-xs text-gray-500">Cek dulu di mutasi rekening sebelum menerima.</p>
            <form action={acceptProof.bind(null, p.id, back)} className="mt-2 grid grid-cols-3 gap-2">
              <Select name="kind" defaultValue={defaultKind}>
                <option value="dp">DP</option>
                <option value="pelunasan">Pelunasan</option>
                <option value="penuh">Lunas</option>
              </Select>
              <Select name="currency" defaultValue={p.currency}>
                <option>IDR</option>
                <option>EGP</option>
                <option>USD</option>
              </Select>
              <Input name="amount" inputMode="decimal" defaultValue={String(p.amount)} />
              <SubmitButton className="col-span-3">Terima, catat pembayaran</SubmitButton>
            </form>
            <form action={rejectProof.bind(null, p.id, back)} className="mt-2 flex gap-2">
              <Input name="reason" placeholder="Alasan tolak (dilihat customer)" />
              <SubmitButton variant="danger">Tolak</SubmitButton>
            </form>
          </div>
        ))}

        {done.length > 0 && (
          <ul className="divide-y divide-gray-100 text-xs">
            {done.map(({ p, shareToken }) => (
              <li key={p.id} className="flex items-center justify-between py-1.5">
                <a href={`/f/${shareToken}`} target="_blank" className="text-brand-600 underline">
                  {fmtMoney(p.amount, p.currency)} · {fmtDateTime(p.createdAt)}
                </a>
                <Badge tone={p.status === "diterima" ? "green" : "red"}>{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
