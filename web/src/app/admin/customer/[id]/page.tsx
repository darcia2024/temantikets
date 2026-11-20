import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, btn, Card, Empty, Field, Input, PageHeader, SectionTitle, Textarea, WaButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { idParam } from "@/lib/form";
import { displayWa } from "@/lib/phone";
import { bookingStatusMeta, voaStatusMeta } from "@/lib/status";
import { fmtDate, fmtDepart } from "@/lib/time";
import { passportWarning, waLink } from "@/lib/wa";
import { ensureReferralCode } from "@/lib/member";
import { pointBalance, pointHistory, pointKindLabel } from "@/lib/points";
import {
  addPassenger,
  adjustPoints,
  deleteCustomer,
  deletePassenger,
  revokeLogins,
  sendLoginLink,
  setReferrer,
  updateCustomer,
  updatePassenger,
} from "../actions";
import { Flash } from "@/components/flash";
import { PassengerFields } from "../passenger-fields";

export default async function CustomerPage({ params, searchParams }: PageProps<"/admin/customer/[id]">) {
  const { id: raw } = await params;
  const sp = await searchParams;
  const id = idParam(raw);
  const db = await getDb();
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, id) });
  if (!c) notFound();
  const [pax, bookings, voas, points, pointRows, referrer, referred, refCode] = await Promise.all([
    db.select().from(schema.passengers).where(eq(schema.passengers.customerId, id)),
    db.select().from(schema.bookings).where(eq(schema.bookings.customerId, id)).orderBy(desc(schema.bookings.createdAt)),
    db.select().from(schema.voaOrders).where(eq(schema.voaOrders.customerId, id)).orderBy(desc(schema.voaOrders.createdAt)),
    pointBalance(id),
    pointHistory(id, 5),
    c.referredById ? db.query.customers.findFirst({ where: eq(schema.customers.id, c.referredById) }) : null,
    db.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.referredById, id)),
    ensureReferralCode(c),
  ]);
  const passportFiles = pax.length
    ? await db
        .select({ passengerId: schema.files.passengerId, shareToken: schema.files.shareToken, filename: schema.files.filename })
        .from(schema.files)
        .where(inArray(schema.files.passengerId, pax.map((p) => p.id)))
    : [];

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

      <SectionTitle>Akun member</SectionTitle>
      <Card className="space-y-3 text-sm">
        <p className="text-gray-600">Customer masuk lewat link sekali pakai yang dikirim ke WA-nya (berlaku 7 hari), lalu bisa lihat order, kirim bukti transfer, dan data paspor.</p>
        <div className="flex flex-wrap gap-2">
          <form action={sendLoginLink.bind(null, c.id)}>
            <SubmitButton variant="wa">Kirim link login via WA</SubmitButton>
          </form>
          <form action={revokeLogins.bind(null, c.id)}>
            <SubmitButton variant="danger" confirm="Keluarkan customer ini dari semua HP yang sudah login?">
              Cabut akses
            </SubmitButton>
          </form>
        </div>
      </Card>

      <SectionTitle>Poin & ajak teman</SectionTitle>
      <Card className="space-y-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-gray-600">Saldo poin</span>
          <span className="text-xl font-bold text-brand-700">{points.toLocaleString("id-ID")}</span>
        </div>
        {pointRows.length > 0 && (
          <ul className="divide-y divide-gray-100 text-xs">
            {pointRows.map((r) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span>
                  {pointKindLabel[r.kind] ?? r.kind} {r.note && <span className="text-gray-500">· {r.note}</span>}
                </span>
                <span className={r.points > 0 ? "text-emerald-700" : "text-red-700"}>
                  {r.points > 0 ? "+" : ""}
                  {r.points}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form action={adjustPoints.bind(null, c.id)} className="grid grid-cols-[auto_5rem_1fr_auto] items-end gap-2">
          <select name="kind" className="rounded-xl px-2 py-2.5 ring-1 ring-gray-300" defaultValue="tukar">
            <option value="tukar">Tukar</option>
            <option value="koreksi">Koreksi ±</option>
          </select>
          <Input name="points" inputMode="numeric" placeholder="50" required />
          <Input name="note" placeholder="Catatan, mis. potongan TT-..." />
          <SubmitButton variant="secondary">Catat</SubmitButton>
        </form>
        <div className="border-t border-gray-100 pt-3">
          <p>
            Kode ajakan: <span className="font-mono font-semibold">{refCode}</span>
            {referred.length > 0 && <span className="text-gray-500"> · mengajak {referred.map((r) => r.name).join(", ")}</span>}
          </p>
          <form action={setReferrer.bind(null, c.id)} className="mt-2 flex gap-2">
            <Input name="code" defaultValue={referrer?.referralCode ?? ""} placeholder="Kode pengajak" className="uppercase" />
            <SubmitButton variant="secondary">Simpan</SubmitButton>
          </form>
          <p className="mt-1 text-xs text-gray-500">
            {referrer ? `Diajak oleh ${referrer.name}.` : "Belum ada pengajak."} Pengajak dapat bonus saat order pertama customer ini jadi.
          </p>
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
                  {passportFiles
                    .filter((f) => f.passengerId === p.id)
                    .map((f) => (
                      <a key={f.shareToken} href={`/f/${f.shareToken}`} target="_blank" className="mr-2 text-xs text-brand-600 underline">
                        Foto paspor: {f.filename}
                      </a>
                    ))}
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
