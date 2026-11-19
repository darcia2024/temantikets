import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { Flash } from "@/components/flash";
import { getDb, schema } from "@/db";
import { btn, Card, Empty, Field, PageHeader, Select } from "@/components/ui";
import { displayWa } from "@/lib/phone";
import { fmtDate } from "@/lib/time";
import { createBooking } from "../actions";
import { BookingFields } from "../booking-form";

export const metadata = { title: "Booking baru" };

export default async function NewBookingPage({ searchParams }: PageProps<"/admin/tiket/baru">) {
  const sp = await searchParams;
  const db = await getDb();
  const customerId = Number(sp.customer) || null;
  const requestId = Number(sp.request) || null;
  const request = requestId ? await db.query.ticketRequests.findFirst({ where: eq(schema.ticketRequests.id, requestId) }) : null;
  const customer = customerId ? await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) }) : null;
  const customers = customer
    ? []
    : await db.select().from(schema.customers).orderBy(desc(schema.customers.createdAt)).limit(300);
  const pax = customer ? await db.select().from(schema.passengers).where(eq(schema.passengers.customerId, customer.id)) : [];
  const suppliers = await db
    .select({ id: schema.suppliers.id, name: schema.suppliers.name })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.active, true))
    .orderBy(asc(schema.suppliers.name));

  return (
    <>
      <PageHeader title="Booking tiket baru" back={customer ? `/admin/customer/${customer.id}` : "/admin/tiket"} />
      <Flash sp={sp} />
      {request && (
        <Card className="mb-4 bg-brand-50">
          <p className="text-sm font-semibold">Dari request {request.code}</p>
          <p className="text-sm text-gray-600">
            {request.route} · {fmtDate(request.departDate)} (±{request.flexDays} hari) · {request.pax} orang · prioritas {request.priority}
          </p>
          {request.notes && <p className="mt-1 text-sm">{request.notes}</p>}
        </Card>
      )}
      <Card>
        <form action={createBooking} className="space-y-4">
          {requestId && <input type="hidden" name="requestId" value={requestId} />}
          {customer ? (
            <>
              <input type="hidden" name="customerId" value={customer.id} />
              <p className="text-sm">
                Customer: <span className="font-semibold">{customer.name}</span> ({displayWa(customer.wa)})
              </p>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-gray-700">Penumpang</legend>
                {pax.length === 0 ? (
                  <Empty>
                    Belum ada penumpang tersimpan.{" "}
                    <Link className="text-brand-600 underline" href={`/admin/customer/${customer.id}`}>
                      Tambah dulu
                    </Link>{" "}
                    atau lanjut tanpa penumpang.
                  </Empty>
                ) : (
                  <div className="space-y-1">
                    {pax.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="passengerIds" value={p.id} defaultChecked={pax.length === 1} className="h-4 w-4" />
                        {p.fullName} <span className="text-gray-400">{p.passportNo}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </>
          ) : customers.length === 0 ? (
            <Empty>
              Belum ada customer.{" "}
              <Link href="/admin/customer/baru" className={btn.secondary}>
                Tambah customer
              </Link>
            </Empty>
          ) : (
            <Field label="Customer" hint="Pilih customer dulu. Penumpang bisa dipilih di halaman booking setelah dibuat.">
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
          <BookingFields defaultRoute={request?.route} suppliers={suppliers} />
        </form>
      </Card>
    </>
  );
}
