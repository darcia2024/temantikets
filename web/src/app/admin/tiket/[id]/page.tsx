import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Flash } from "@/components/flash";
import { ChangesSection } from "./changes-section";
import { getDb, schema } from "@/db";
import { PaymentsSection } from "@/components/payments-section";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Input, PageHeader, Row, SectionTitle, WaButton } from "@/components/ui";
import { idParam } from "@/lib/form";
import { fmtMoney } from "@/lib/money";
import { displayWa } from "@/lib/phone";
import { bookingNext, bookingStatusMeta } from "@/lib/status";
import { fmtCountdown, fmtDateTime, routeTimeZone } from "@/lib/time";
import { appUrl, passportWarning, templates, waLink } from "@/lib/wa";
import { deleteBooking, deleteFile, setBookingPassengers, setBookingStatus, updateBooking, uploadBookingFiles } from "../actions";
import { BookingFields } from "../booking-form";

const errors: Record<string, string> = {
  alasan: "Isi alasan batal dulu (untuk laporan).",
  hold: "Isi PNR dan time limit dulu sebelum HOLD.",
  nominal: "Nominal pembayaran tidak valid.",
};

export default async function BookingPage({ params, searchParams }: PageProps<"/admin/tiket/[id]">) {
  const id = idParam((await params).id);
  const sp = await searchParams;
  const db = await getDb();
  const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) });
  if (!b) notFound();
  const [customer, linked, allPax, fileRows, changes, suppliers] = await Promise.all([
    db.query.customers.findFirst({ where: eq(schema.customers.id, b.customerId) }),
    db
      .select({ p: schema.passengers })
      .from(schema.bookingPassengers)
      .innerJoin(schema.passengers, eq(schema.passengers.id, schema.bookingPassengers.passengerId))
      .where(eq(schema.bookingPassengers.bookingId, id)),
    db.select().from(schema.passengers).where(eq(schema.passengers.customerId, b.customerId)),
    db
      .select({
        id: schema.files.id,
        kind: schema.files.kind,
        filename: schema.files.filename,
        shareToken: schema.files.shareToken,
        size: schema.files.size,
      })
      .from(schema.files)
      .where(eq(schema.files.bookingId, id)),
    db.select().from(schema.bookingChanges).where(eq(schema.bookingChanges.bookingId, id)).orderBy(desc(schema.bookingChanges.createdAt)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  if (!customer) notFound();
  const meta = bookingStatusMeta[b.status];
  const linkedIds = new Set(linked.map((l) => l.p.id));
  const ticketLinks = fileRows.filter((f) => f.kind === "tiket").map((f) => appUrl(`/f/${f.shareToken}`));
  const back = `/admin/tiket/${id}`;
  const margin = b.sellPrice != null && b.costPrice != null ? b.sellPrice - b.costPrice : null;
  const s = b.status;
  const messages = [
    ...(s === "penawaran" || s === "hold" ? [{ label: "Penawaran", text: templates.penawaran(customer.name, b) }] : []),
    ...(s === "hold" ? [{ label: "Tagihan", text: templates.tagihan(customer.name, b) }] : []),
    ...(s === "issued" || s === "perubahan" ? [{ label: "E-ticket", text: templates.tiket(customer.name, b, ticketLinks) }] : []),
    ...(s === "issued" || s === "berangkat" ? [{ label: "Reminder H-1", text: templates.reminder(customer.name, b) }] : []),
  ];
  const recipients = [{ label: "customer", wa: customer.wa }, ...(customer.waParent ? [{ label: "ortu", wa: customer.waParent }] : [])];

  return (
    <>
      <PageHeader title={b.code} back="/admin/tiket" />
      <Flash sp={sp} legacy={errors} />

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <Link href={`/admin/customer/${customer.id}`} className="font-semibold underline-offset-2 hover:underline">
              {customer.name}
            </Link>
            <p className="text-sm text-gray-500">{displayWa(customer.wa)}</p>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        {b.status === "hold" && b.timeLimitAt && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Time limit {fmtDateTime(b.timeLimitAt)} · {fmtCountdown(b.timeLimitAt)}
          </p>
        )}
        <dl className="mt-3 divide-y divide-gray-100">
          <Row label="Rute">{b.route}</Row>
          <Row label="Maskapai">{b.airline ?? "-"}</Row>
          <Row label="Berangkat">{fmtDateTime(b.departAt, routeTimeZone(b.route))}</Row>
          <Row label="PNR">{b.pnr ?? "-"}</Row>
          <Row label="Supplier">
            {b.supplierId ? (
              <Link href={`/admin/supplier/${b.supplierId}`} className="underline underline-offset-2">
                {b.supplier}
              </Link>
            ) : (
              (b.supplier ?? "-")
            )}
          </Row>
          <Row label="Harga jual">{fmtMoney(b.sellPrice, b.currency)}</Row>
          <Row label="Margin">{margin != null ? fmtMoney(margin, b.currency) : "-"}</Row>
          {b.ticketNumbers && <Row label="No. tiket">{b.ticketNumbers}</Row>}
          {b.cancelReason && <Row label="Alasan batal">{b.cancelReason}</Row>}
        </dl>
        {b.notes && <p className="mt-2 text-sm text-gray-600">{b.notes}</p>}
      </Card>

      {bookingNext[b.status].length > 0 && (
        <>
          <SectionTitle>Ubah status</SectionTitle>
          <Card>
            <form action={setBookingStatus.bind(null, id)} className="flex flex-wrap gap-2">
              {bookingNext[b.status]
                .filter((s) => s !== "batal")
                .map((s) => (
                  <SubmitButton key={s} name="to" value={s} variant="secondary">
                    → {bookingStatusMeta[s].label}
                  </SubmitButton>
                ))}
            </form>
            {bookingNext[b.status].includes("batal") && (
              <form action={setBookingStatus.bind(null, id)} className="mt-3 flex gap-2">
                <input type="hidden" name="to" value="batal" />
                <Input name="cancelReason" placeholder="Alasan batal" />
                <SubmitButton variant="danger" confirm="Batalkan booking ini?">
                  Batal
                </SubmitButton>
              </form>
            )}
          </Card>
        </>
      )}

      {messages.length > 0 && (
        <>
          <SectionTitle>Kirim lewat WhatsApp</SectionTitle>
          <Card className="space-y-3">
            {recipients.map((r) => (
              <div key={r.label} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-xs font-semibold uppercase text-gray-500">{r.label}</span>
                {messages.map((m) => (
                  <WaButton key={m.label} href={waLink(r.wa, m.text)}>
                    {m.label}
                  </WaButton>
                ))}
              </div>
            ))}
            <p className="text-xs text-gray-500">Tombol membuka WhatsApp dengan pesan siap kirim. Tinggal tekan kirim.</p>
          </Card>
        </>
      )}

      <SectionTitle>Penumpang</SectionTitle>
      <Card>
        {allPax.length === 0 ? (
          <p className="text-sm text-gray-500">
            Belum ada penumpang tersimpan untuk customer ini.{" "}
            <Link href={`/admin/customer/${customer.id}`} className="text-brand-600 underline">
              Tambah
            </Link>
          </p>
        ) : (
          <form action={setBookingPassengers.bind(null, id)} className="space-y-2">
            {allPax.map((p) => {
              const warn = passportWarning(p.passportExpiry, b.departAt);
              return (
                <label key={p.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="passengerIds" value={p.id} defaultChecked={linkedIds.has(p.id)} className="mt-0.5 h-4 w-4" />
                  <span>
                    {p.fullName} <span className="text-gray-400">{p.passportNo}</span>
                    {warn && <span className="block text-xs font-medium text-red-700">{warn}</span>}
                  </span>
                </label>
              );
            })}
            <SubmitButton variant="secondary">Simpan penumpang</SubmitButton>
          </form>
        )}
      </Card>

      <SectionTitle>File tiket & bukti</SectionTitle>
      <Card className="space-y-3">
        {ticketLinks.length === 0 && (b.status === "issued" || b.status === "dibayar") && (
          <Empty>Upload PDF e-ticket supaya bisa dikirim ke customer.</Empty>
        )}
        {fileRows.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada file.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {fileRows.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <a href={`/f/${f.shareToken}`} target="_blank" className="truncate text-brand-600 underline">
                  {f.filename}
                </a>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={f.kind === "tiket" ? "green" : "gray"}>{f.kind}</Badge>
                  <form action={deleteFile.bind(null, f.id, back)}>
                    <SubmitButton variant="danger" className="!px-2 !py-1 text-xs" confirm="Hapus file ini?">
                      Hapus
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form action={uploadBookingFiles.bind(null, id)} className="space-y-2">
          <div className="flex gap-2">
            <select name="kind" className="rounded-xl px-2 ring-1 ring-gray-300">
              <option value="tiket">E-ticket</option>
              <option value="bukti">Bukti bayar</option>
            </select>
            <Input type="file" name="files" accept="application/pdf,image/*" multiple required />
          </div>
          <SubmitButton variant="secondary">Upload</SubmitButton>
        </form>
      </Card>

      <ChangesSection booking={b} changes={changes} hasSupplier={!!b.supplierId} />

      <PaymentsSection
        target={{ bookingId: id }}
        back={back}
        customer={customer}
        label={`tiket ${b.code}`}
        defaultCurrency={b.currency}
        defaultKind="penuh"
        suggested={b.sellPrice}
      />

      <details className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600">Ubah detail booking</summary>
        <form action={updateBooking.bind(null, id)} className="mt-4 space-y-4">
          <BookingFields b={b} suppliers={suppliers} />
        </form>
        {(b.status === "penawaran" || b.status === "batal") && (
          <form action={deleteBooking.bind(null, id)} className="mt-4 border-t border-gray-100 pt-4">
            <SubmitButton variant="danger" confirm={`Hapus booking ${b.code} permanen?`}>
              Hapus booking
            </SubmitButton>
            <p className="mt-1 text-xs text-gray-500">Hanya untuk penawaran yang tidak jadi, tanpa pembayaran.</p>
          </form>
        )}
      </details>
    </>
  );
}
