import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Currency } from "@/db/schema";
import { deletePayment, recordPayment } from "@/app/admin/kas/actions";
import { fmtMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";
import { appUrl, templates, waLink } from "@/lib/wa";
import { SubmitButton } from "./submit-button";
import { Badge, Card, Empty, Field, Input, SectionTitle, Select } from "./ui";

const kindLabel: Record<string, string> = { dp: "DP", pelunasan: "Pelunasan", penuh: "Lunas", refund: "Refund" };

export async function PaymentsSection({
  target,
  back,
  customer,
  label,
  defaultCurrency,
  defaultKind,
  suggested,
}: {
  target: { bookingId?: number; voaId?: number };
  back: string;
  customer: { name: string; wa: string };
  label: string;
  defaultCurrency: Currency;
  defaultKind: "dp" | "pelunasan" | "penuh";
  suggested?: number | null;
}) {
  const db = await getDb();
  const settings = await getSettings();
  const rows = await db
    .select()
    .from(schema.payments)
    .where(target.bookingId ? eq(schema.payments.bookingId, target.bookingId) : eq(schema.payments.voaId, target.voaId!))
    .orderBy(desc(schema.payments.receivedAt));

  return (
    <>
      <SectionTitle>Pembayaran</SectionTitle>
      {rows.length === 0 ? (
        <Empty>Belum ada pembayaran tercatat.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {rows.map((p) => {
            const link = appUrl(`/kwitansi/${p.receiptToken}`);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {fmtMoney(p.amount, p.currency)} <Badge tone={p.kind === "refund" ? "red" : "green"}>{kindLabel[p.kind]}</Badge>
                  </p>
                  <p className="text-xs text-gray-500">
                    {p.method === "tunai" ? `Tunai, dipegang ${p.receivedBy}` : p.method} · {fmtDateTime(p.receivedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <Link href={`/kwitansi/${p.receiptToken}`} target="_blank" className="text-brand-600 underline">
                    Kwitansi
                  </Link>
                  <a
                    href={waLink(customer.wa, templates.kwitansi(customer.name, label, p.amount, p.currency, link))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#178a45] underline"
                  >
                    Kirim WA
                  </a>
                  <form action={deletePayment.bind(null, p.id, back)}>
                    <SubmitButton
                      variant="danger"
                      className="!px-2 !py-0.5 text-[11px]"
                      confirm={`Hapus pembayaran ${fmtMoney(p.amount, p.currency)}? Hanya untuk salah input; tercatat di audit log.`}
                    >
                      Hapus
                    </SubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <details className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Catat pembayaran</summary>
        <form action={recordPayment.bind(null, target, back)} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis">
              <Select name="kind" defaultValue={defaultKind}>
                <option value="dp">DP</option>
                <option value="pelunasan">Pelunasan</option>
                <option value="penuh">Lunas sekaligus</option>
                <option value="refund">Refund</option>
              </Select>
            </Field>
            <Field label="Metode">
              <Select name="method" defaultValue="transfer">
                <option value="transfer">Transfer bank</option>
                <option value="tunai">Tunai</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mata uang">
              <Select name="currency" defaultValue={defaultCurrency}>
                <option>IDR</option>
                <option>EGP</option>
                <option>USD</option>
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Nominal">
                <Input name="amount" inputMode="decimal" required defaultValue={suggested ?? ""} />
              </Field>
            </div>
          </div>
          <Field label="Uang tunai dipegang oleh" hint="Hanya untuk pembayaran tunai.">
            <Select name="receivedBy" defaultValue="owner">
              {settings.cashHolders.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan">
            <Input name="note" placeholder="Bank, nama pengirim, dll." />
          </Field>
          <SubmitButton className="w-full">Simpan pembayaran</SubmitButton>
        </form>
      </details>
    </>
  );
}
