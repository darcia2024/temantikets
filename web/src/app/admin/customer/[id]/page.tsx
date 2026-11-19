import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, btn, Card, Empty, Field, Input, PageHeader, SectionTitle, Textarea, WaButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { idParam } from "@/lib/form";
import { displayWa } from "@/lib/phone";
import { bookingStatusMeta, voaStatusMeta } from "@/lib/status";
import { fmtDate, fmtDepart } from "@/lib/time";
import { passportWarning, waLink } from "@/lib/wa";
import { addPassenger, deleteCustomer, deletePassenger, updateCustomer, updatePassenger } from "../actions";
import { Flash } from "@/components/flash";
import { PassengerFields } from "../passenger-fields";

export default async function CustomerPage({ params, searchParams }: PageProps<"/admin/customer/[id]">) {
  const { id: raw } = await params;
  const sp = await searchParams;
  const id = idParam(raw);
  const db = await getDb();
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, id) });
  if (!c) notFound();
  const [pax, bookings, voas] = await Promise.all([
    db.select().from(schema.passengers).where(eq(schema.passengers.customerId, id)),
    db.select().from(schema.bookings).where(eq(schema.bookings.customerId, id)).orderBy(desc(schema.bookings.createdAt)),
    db.select().from(schema.voaOrders).where(eq(schema.voaOrders.customerId, id)).orderBy(desc(schema.voaOrders.createdAt)),
  ]);

  return (
    <>
      <PageHeader title={c.name} back="/admin/customer" />
      <Flash sp={sp} />

      <Card>
        <p className="text-sm text-gray-500">{displayWa(c.wa)}</p>
        {c.waParent && <p className="text-sm text-gray-500">Orang tua: {displayWa(c.waParent)}</p>}
        {c.notes && <p className="mt-2 text-sm">{c.notes}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <WaButton href={waLink(c.wa, `Assalamualaikum ${c.name}, `)}>Chat</WaButton>
          <Link href={`/admin/tiket/baru?customer=${c.id}`} className={btn.secondary}>
            + Booking tiket
          </Link>
          <Link href={`/admin/voa/baru?customer=${c.id}`} className={btn.secondary}>
            + Order VOA
          </Link>
        </div>
      </Card>

      <SectionTitle>Penumpang tersimpan</SectionTitle>
      {pax.length === 0 ? (
        <Empty>Belum ada data paspor. Tambahkan di bawah supaya tidak perlu ketik ulang.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {pax.map((p) => {
            const warn = passportWarning(p.passportExpiry, null);
            return (
              <details key={p.id} className="group px-4 py-3">
                <summary className="cursor-pointer list-none">
                  <p className="flex items-center justify-between font-medium">
                    <span>
                      {p.fullName} {p.isStudent && <Badge tone="blue">Pelajar</Badge>}
                    </span>
                    <span className="text-xs font-semibold text-brand-700 group-open:hidden">Ubah</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Paspor {p.passportNo ?? "-"} · berlaku s/d {fmtDate(p.passportExpiry)}
                  </p>
                  {warn && <p className="mt-1 text-xs font-medium text-red-700">{warn}</p>}
                </summary>
                <form action={updatePassenger.bind(null, p.id)} className="mt-3 space-y-3">
                  <PassengerFields p={p} />
                  <div className="flex gap-2">
                    <SubmitButton>Simpan</SubmitButton>
                    <SubmitButton variant="danger" formAction={deletePassenger.bind(null, p.id)} confirm={`Hapus ${p.fullName}?`}>
                      Hapus
                    </SubmitButton>
                  </div>
                </form>
              </details>
            );
          })}
        </Card>
      )}
      <details className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Tambah penumpang</summary>
        <form action={addPassenger.bind(null, c.id)} className="mt-4 space-y-3">
          <PassengerFields />
          <SubmitButton>Simpan penumpang</SubmitButton>
        </form>
      </details>

      <SectionTitle>Riwayat tiket</SectionTitle>
      {bookings.length === 0 ? (
        <Empty>Belum ada booking.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {bookings.map((b) => (
            <Link key={b.id} href={`/admin/tiket/${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <p className="font-medium">
                  {b.route} · {b.airline ?? "-"}
                </p>
                <p className="text-sm text-gray-500">
                  {b.code} · {fmtDepart(b)}
                </p>
              </div>
              <Badge tone={bookingStatusMeta[b.status].tone}>{bookingStatusMeta[b.status].label}</Badge>
            </Link>
          ))}
        </Card>
      )}

      <SectionTitle>Riwayat VOA</SectionTitle>
      {voas.length === 0 ? (
        <Empty>Belum ada order VOA.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {voas.map((v) => (
            <Link key={v.id} href={`/admin/voa/${v.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <p className="font-medium">{v.code}</p>
                <p className="text-sm text-gray-500">{v.pax} orang</p>
              </div>
              <Badge tone={voaStatusMeta[v.status].tone}>{voaStatusMeta[v.status].label}</Badge>
            </Link>
          ))}
        </Card>
      )}

      <details className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600">Ubah data customer</summary>
        <form action={updateCustomer.bind(null, c.id)} className="mt-4 space-y-3">
          <Field label="Nama">
            <Input name="name" defaultValue={c.name} required />
          </Field>
          <Field label="Nomor WhatsApp">
            <Input name="wa" defaultValue={c.wa} type="tel" required />
          </Field>
          <Field label="WA orang tua">
            <Input name="waParent" defaultValue={c.waParent ?? ""} type="tel" />
          </Field>
          <Field label="Catatan">
            <Textarea name="notes" defaultValue={c.notes ?? ""} />
          </Field>
          <div className="flex gap-2">
            <SubmitButton>Simpan perubahan</SubmitButton>
            <SubmitButton
              variant="danger"
              formAction={deleteCustomer.bind(null, c.id)}
              confirm={`Hapus ${c.name} beserta data paspornya? Hanya bisa kalau belum punya booking/VOA.`}
            >
              Hapus customer
            </SubmitButton>
          </div>
        </form>
      </details>
    </>
  );
}
