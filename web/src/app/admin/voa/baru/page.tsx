import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Flash } from "@/components/flash";
import { btn, Card, Empty, Field, PageHeader, Select } from "@/components/ui";
import { displayWa } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { createVoa } from "../actions";
import { VoaFields } from "../voa-form";

export const metadata = { title: "Order VOA baru" };

export default async function NewVoaPage({ searchParams }: PageProps<"/admin/voa/baru">) {
  const sp = await searchParams;
  const db = await getDb();
  const settings = await getSettings();
  const customerId = Number(sp.customer) || null;
  const bookingId = Number(sp.booking) || null;
  const customer = customerId ? await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) }) : null;
  const customers = customer ? [] : await db.select().from(schema.customers).orderBy(desc(schema.customers.createdAt)).limit(300);
  const pax = customer ? await db.select().from(schema.passengers).where(eq(schema.passengers.customerId, customer.id)) : [];

  return (
    <>
      <PageHeader title="Order VOA baru" back={customer ? `/admin/customer/${customer.id}` : "/admin/voa"} />
      <Flash sp={sp} />
      <Card>
        <form action={createVoa} className="space-y-4">
          {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
          {customer ? (
            <>
              <input type="hidden" name="customerId" value={customer.id} />
              <p className="text-sm">
                Customer: <span className="font-semibold">{customer.name}</span> ({displayWa(customer.wa)})
              </p>
              {pax.length > 0 && (
                <fieldset>
                  <legend className="mb-1 text-sm font-medium text-gray-700">Pemohon</legend>
                  {pax.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="passengerIds" value={p.id} className="h-4 w-4" />
                      {p.fullName} <span className="text-gray-400">{p.passportNo}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          ) : customers.length === 0 ? (
            <Empty>
              Belum ada customer.{" "}
              <Link href="/admin/customer/baru" className={btn.secondary}>
                Tambah customer
              </Link>
            </Empty>
          ) : (
            <Field label="Customer">
              <Select name="customerId" required defaultValue="">
                <option value="" disabled>
                  Pilih customer...
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({displayWa(c.wa)})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <VoaFields tiers={settings.voaTiers} defaultPax={pax.length || 1} />
        </form>
      </Card>
    </>
  );
}
