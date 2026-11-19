import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Flash } from "@/components/flash";
import { btn, Card, Empty, Input, PageHeader } from "@/components/ui";
import { displayWa } from "@/lib/phone";

export const metadata = { title: "Customer" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customer">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const db = await getDb();
  const digits = q.replace(/\D/g, "");
  const rows = await db
    .select()
    .from(schema.customers)
    .where(
      q
        ? or(
            ilike(schema.customers.name, `%${q}%`),
            digits.length >= 4 ? ilike(schema.customers.wa, `%${digits.replace(/^0/, "")}%`) : undefined,
          )
        : undefined,
    )
    .orderBy(desc(schema.customers.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Customer"
        action={
          <Link href="/admin/customer/baru" className={btn.primary}>
            + Baru
          </Link>
        }
      />
      <Flash sp={sp} />
      <form className="mb-4">
        <Input name="q" defaultValue={q} placeholder="Cari nama atau nomor WA..." type="search" />
      </form>
      {rows.length === 0 ? (
        <Empty>{q ? "Tidak ada customer yang cocok." : "Belum ada customer. Tambah manual atau import kontak lama."}</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {rows.map((c) => (
            <Link key={c.id} href={`/admin/customer/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-gray-500">{displayWa(c.wa)}</p>
              </div>
              <span className="text-gray-300">›</span>
            </Link>
          ))}
        </Card>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/admin/import" className="text-brand-600 underline">
          Import kontak lama dari HP
        </Link>
      </p>
    </>
  );
}
