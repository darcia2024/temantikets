import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import { supplierBalances } from "@/lib/suppliers";
import { createSupplier } from "./actions";
import { SupplierFields } from "./supplier-fields";

export const metadata = { title: "Supplier" };

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/supplier">) {
  const sp = await searchParams;
  const db = await getDb();
  const [rows, balances] = await Promise.all([db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)), supplierBalances()]);

  return (
    <>
      <PageHeader title="Supplier & deposit" back="/admin/lainnya" />
      <Flash sp={sp} />
      {rows.length === 0 ? (
        <Empty>Belum ada supplier. Tambah konsolidator/agen tempat lo issued tiket supaya saldo deposit terpantau.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const bal = balances.get(s.id) ?? 0;
            const low = s.lowBalance != null && bal < s.lowBalance;
            return (
              <Link key={s.id} href={`/admin/supplier/${s.id}`} className="block">
                <Card className={low ? "ring-2 ring-red-300" : ""}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {s.name} {!s.active && <Badge>nonaktif</Badge>}
                      </p>
                      <p className="text-xs capitalize text-gray-500">{s.kind}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${bal < 0 || low ? "text-red-700" : "text-ink"}`}>{fmtMoney(bal, s.currency)}</p>
                      {low && <p className="text-xs font-semibold text-red-700">Saldo menipis</p>}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <details className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">+ Tambah supplier</summary>
        <form action={createSupplier} className="mt-4 space-y-3">
          <SupplierFields />
          <Field label="Saldo deposit saat ini (opsional)">
            <Input name="opening" inputMode="decimal" />
          </Field>
          <SubmitButton>Simpan supplier</SubmitButton>
        </form>
      </details>
      <p className="mt-4 text-xs text-gray-500">
        Deposit otomatis terpotong harga modal saat booking dengan supplier ini ditandai Issued. Biaya reschedule dan refund dari supplier ikut tercatat dari menu Reschedule/refund di booking.
      </p>
    </>
  );
}
