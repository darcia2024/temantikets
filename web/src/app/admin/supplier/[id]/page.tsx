import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Field, Input, PageHeader, SectionTitle, Select } from "@/components/ui";
import { idParam } from "@/lib/form";
import { fmtMoney } from "@/lib/money";
import { supplierBalances } from "@/lib/suppliers";
import { fmtDateTime } from "@/lib/time";
import { addLedgerEntry, deleteSupplier, updateSupplier } from "../actions";
import { SupplierFields } from "../supplier-fields";

const kindLabel: Record<string, string> = { topup: "Top up", potong: "Issued", refund: "Refund", koreksi: "Koreksi" };

export default async function SupplierPage({ params, searchParams }: PageProps<"/admin/supplier/[id]">) {
  const id = idParam((await params).id);
  const sp = await searchParams;
  const db = await getDb();
  const s = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) });
  if (!s) notFound();
  const [ledger, balances] = await Promise.all([
    db
      .select({ l: schema.supplierLedger, code: schema.bookings.code })
      .from(schema.supplierLedger)
      .leftJoin(schema.bookings, eq(schema.bookings.id, schema.supplierLedger.bookingId))
      .where(eq(schema.supplierLedger.supplierId, id))
      .orderBy(desc(schema.supplierLedger.createdAt))
      .limit(200),
    supplierBalances(),
  ]);
  const bal = balances.get(id) ?? 0;
  const low = s.lowBalance != null && bal < s.lowBalance;

  return (
    <>
      <PageHeader title={s.name} back="/admin/supplier" />
      <Flash sp={sp} />
      <Card className={low ? "ring-2 ring-red-300" : ""}>
        <p className="text-xs uppercase tracking-wide text-gray-500">Saldo deposit</p>
        <p className={`text-3xl font-bold ${bal < 0 || low ? "text-red-700" : ""}`}>{fmtMoney(bal, s.currency)}</p>
        {low && <p className="text-sm font-semibold text-red-700">Di bawah batas {fmtMoney(s.lowBalance, s.currency)}. Saatnya top up.</p>}
        {s.notes && <p className="mt-2 text-sm text-gray-600">{s.notes}</p>}
      </Card>

      <SectionTitle>Catat top up / koreksi</SectionTitle>
      <Card>
        <form action={addLedgerEntry.bind(null, id)} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Jenis">
              <Select name="kind" defaultValue="topup">
                <option value="topup">Top up</option>
                <option value="koreksi">Koreksi</option>
              </Select>
            </Field>
            <Field label="Arah (koreksi)">
              <Select name="direction" defaultValue="tambah">
                <option value="tambah">Tambah</option>
                <option value="kurang">Kurang</option>
              </Select>
            </Field>
            <Field label={`Nominal (${s.currency})`}>
              <Input name="amount" inputMode="decimal" required />
            </Field>
          </div>
          <Field label="Keterangan">
            <Input name="note" placeholder="Transfer BCA 20/11, selisih rekonsiliasi..." />
          </Field>
          <SubmitButton>Simpan</SubmitButton>
        </form>
      </Card>

      <SectionTitle>Mutasi</SectionTitle>
      {ledger.length === 0 ? (
        <Empty>Belum ada mutasi.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {ledger.map(({ l, code }) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {kindLabel[l.kind] ?? l.kind}{" "}
                  {l.bookingId && code && (
                    <Link href={`/admin/tiket/${l.bookingId}`} className="text-brand-700 underline">
                      {code}
                    </Link>
                  )}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {fmtDateTime(l.createdAt)}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
              </div>
              <span className={`shrink-0 font-semibold ${l.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {l.amount > 0 ? "+" : ""}
                {fmtMoney(l.amount, s.currency)}
              </span>
            </div>
          ))}
        </Card>
      )}

      <details className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600">Ubah supplier</summary>
        <form action={updateSupplier.bind(null, id)} className="mt-4 space-y-3">
          <SupplierFields s={s} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4" /> Aktif (muncul di pilihan booking)
          </label>
          <div className="flex gap-2">
            <SubmitButton>Simpan</SubmitButton>
            <SubmitButton variant="danger" formAction={deleteSupplier.bind(null, id)} confirm={`Hapus ${s.name}?`}>
              Hapus
            </SubmitButton>
          </div>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          Status: <Badge tone={s.active ? "green" : "gray"}>{s.active ? "aktif" : "nonaktif"}</Badge>
        </p>
      </details>
    </>
  );
}
