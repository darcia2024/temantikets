import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PaymentsSection } from "@/components/payments-section";
import { ProofsSection } from "@/components/proofs-section";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Input, PageHeader, Row, SectionTitle, WaButton } from "@/components/ui";
import { deleteFile } from "@/app/admin/tiket/actions";
import { idParam } from "@/lib/form";
import { fmtMoney } from "@/lib/money";
import { displayWa } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { mandubStatusMeta, voaNext, voaStatusMeta } from "@/lib/status";
import { addBusinessDays, fmtDateTime, TZ_CAIRO } from "@/lib/time";
import { appUrl, passportWarning, voaTemplates, waLink } from "@/lib/wa";
import { deleteVoa, setVoaDocs, setVoaPassengers, setVoaStatus, updateVoa, uploadVoaFiles } from "../actions";
import { Flash } from "@/components/flash";
import { VoaFields } from "../voa-form";

const errors: Record<string, string> = {
  alasan: "Isi alasan batal dulu.",
  dokumen: "Centang paspor dan tiket PP dulu sebelum lanjut.",
  nominal: "Nominal pembayaran tidak valid.",
};

const fileKindLabel: Record<string, string> = {
  otb: "OK to Board",
  boarding: "Foto hari H",
  bukti: "Bukti bayar",
  dokumen: "Dokumen dari customer",
  lainnya: "Lainnya",
};

export default async function VoaPage({ params, searchParams }: PageProps<"/admin/voa/[id]">) {
  const id = idParam((await params).id);
  const sp = await searchParams;
  const db = await getDb();
  const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, id) });
  if (!v) notFound();
  const [customer, linked, allPax, fileRows, settings] = await Promise.all([
    db.query.customers.findFirst({ where: eq(schema.customers.id, v.customerId) }),
    db.select({ id: schema.voaPassengers.passengerId }).from(schema.voaPassengers).where(eq(schema.voaPassengers.voaId, id)),
    db.select().from(schema.passengers).where(eq(schema.passengers.customerId, v.customerId)),
    db
      .select({ id: schema.files.id, kind: schema.files.kind, filename: schema.files.filename, shareToken: schema.files.shareToken })
      .from(schema.files)
      .where(eq(schema.files.voaId, id)),
    getSettings(),
  ]);
  if (!customer) notFound();
  const meta = voaStatusMeta[v.status];
  const linkedIds = new Set(linked.map((l) => l.id));
  const otbLinks = fileRows.filter((f) => f.kind === "otb").map((f) => appUrl(`/f/${f.shareToken}`));
  const back = `/admin/voa/${id}`;

  // OK to Board takes 3-4 working days from DP. Warn when the flight is too close.
  const otbEta = v.status === "dp" && v.dpAt ? addBusinessDays(v.dpAt, 4) : null;
  const earliestIfDpNow = addBusinessDays(new Date(), 4);
  const tooClose =
    v.arrivalAt &&
    ((otbEta && v.arrivalAt < otbEta) || (["konfirmasi", "dokumen"].includes(v.status) && v.arrivalAt < earliestIfDpNow));

  const half = v.totalUsd != null ? v.totalUsd / 2 : null;
  const suggestedKind = v.status === "otb_terbit" ? "pelunasan" : "dp";

  return (
    <>
      <PageHeader title={v.code} back="/admin/voa" />
      <Flash sp={sp} legacy={errors} />
      {tooClose && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
          Jadwal tiba terlalu dekat: OK to Board butuh 3-4 hari kerja setelah DP.
        </p>
      )}

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <Link href={`/admin/customer/${customer.id}`} className="font-semibold hover:underline">
              {customer.name}
            </Link>
            <p className="text-sm text-gray-500">{displayWa(customer.wa)}</p>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <dl className="mt-3 divide-y divide-gray-100">
          <Row label="Jumlah">{v.pax} orang</Row>
          <Row label="Tarif">{v.rateUsd != null ? `${fmtMoney(v.rateUsd, "USD")}/orang` : "Nego"}</Row>
          <Row label="Total">{fmtMoney(v.totalUsd, "USD")}</Row>
          <Row label="Tiba di Kairo">{fmtDateTime(v.arrivalAt, TZ_CAIRO)}</Row>
          <Row label="Penerbangan">
            {[v.airline, v.flightNo, v.terminal].filter(Boolean).join(" · ") || "-"}
          </Row>
          {v.dpAt && <Row label="DP masuk">{fmtDateTime(v.dpAt)}</Row>}
          {otbEta && <Row label="Estimasi OTB terbit">{fmtDateTime(otbEta)}</Row>}
          {v.otbIssuedAt && <Row label="OTB terbit">{fmtDateTime(v.otbIssuedAt)}</Row>}
          <Row label="Mandub">
            <Badge tone={mandubStatusMeta[v.mandubStatus].tone}>{mandubStatusMeta[v.mandubStatus].label}</Badge>
          </Row>
          {v.mandubNote && <Row label="Catatan Mandub">{v.mandubNote}</Row>}
          {v.cancelReason && <Row label="Alasan batal">{v.cancelReason}</Row>}
        </dl>
        {v.notes && <p className="mt-2 text-sm text-gray-600">{v.notes}</p>}
        <p className="mt-3 text-xs text-gray-500">
          Lacak Order:{" "}
          <a className="text-brand-600 underline" href={`/lacak/${v.code}`} target="_blank">
            {appUrl(`/lacak/${v.code}`)}
          </a>
        </p>
      </Card>

      <SectionTitle>Checklist dokumen</SectionTitle>
      <Card>
        <form action={setVoaDocs.bind(null, id)} className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="docsPassport" defaultChecked={v.docsPassport} className="h-4 w-4" />
            Paspor semua pemohon (masa berlaku min. 6 bulan)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="docsTicket" defaultChecked={v.docsTicket} className="h-4 w-4" />
            Tiket masuk & keluar Mesir (pelajar Mesir tidak wajib tiket keluar)
          </label>
          <SubmitButton variant="secondary">Simpan checklist</SubmitButton>
        </form>
      </Card>

      {voaNext[v.status].length > 0 && (
        <>
          <SectionTitle>Ubah status</SectionTitle>
          <Card>
            <form action={setVoaStatus.bind(null, id)} className="flex flex-wrap gap-2">
              {voaNext[v.status]
                .filter((s) => s !== "batal")
                .map((s) => (
                  <SubmitButton key={s} name="to" value={s} variant="secondary">
                    → {voaStatusMeta[s].label}
                  </SubmitButton>
                ))}
            </form>
            {voaNext[v.status].includes("batal") && (
              <form action={setVoaStatus.bind(null, id)} className="mt-3 flex gap-2">
                <input type="hidden" name="to" value="batal" />
                <Input name="cancelReason" placeholder="Alasan batal" />
                <SubmitButton variant="danger" confirm={v.dpAt ? "DP akan dicatat sebagai cancellation fee. Batalkan?" : "Batalkan order ini?"}>
                  Batal
                </SubmitButton>
              </form>
            )}
          </Card>
        </>
      )}

      <SectionTitle>Kirim lewat WhatsApp</SectionTitle>
      <Card className="flex flex-wrap gap-2">
        <WaButton href={waLink(customer.wa, voaTemplates.konfirmasi(customer.name, v))}>Konfirmasi + minta dokumen</WaButton>
        {v.status === "dokumen" && <WaButton href={waLink(customer.wa, voaTemplates.tagihanDp(customer.name, v))}>Tagihan DP 50%</WaButton>}
        {v.status === "otb_terbit" && (
          <WaButton href={waLink(customer.wa, voaTemplates.otb(customer.name, v, otbLinks))}>Kirim OTB + pelunasan</WaButton>
        )}
        {v.status === "lunas" && <WaButton href={waLink(customer.wa, voaTemplates.hariH(customer.name, v))}>Instruksi hari H</WaButton>}
      </Card>

      <SectionTitle>Pemohon</SectionTitle>
      <Card>
        {allPax.length === 0 ? (
          <p className="text-sm text-gray-500">
            Belum ada data paspor.{" "}
            <Link href={`/admin/customer/${customer.id}`} className="text-brand-600 underline">
              Tambah
            </Link>
          </p>
        ) : (
          <form action={setVoaPassengers.bind(null, id)} className="space-y-2">
            {allPax.map((p) => {
              const warn = passportWarning(p.passportExpiry, v.arrivalAt);
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
            <SubmitButton variant="secondary">Simpan pemohon</SubmitButton>
          </form>
        )}
      </Card>

      <SectionTitle>File (OK to Board, dokumen, foto hari H)</SectionTitle>
      <Card className="space-y-3">
        {v.status === "otb_terbit" && otbLinks.length === 0 && <Empty>Upload file OK to Board supaya bisa dikirim ke customer.</Empty>}
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
                  <Badge tone={f.kind === "otb" ? "green" : "gray"}>{fileKindLabel[f.kind] ?? f.kind}</Badge>
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
        <form action={uploadVoaFiles.bind(null, id)} className="space-y-2">
          <div className="flex gap-2">
            <select name="kind" className="rounded-xl px-2 ring-1 ring-gray-300" defaultValue={v.status === "dp" ? "otb" : "boarding"}>
              <option value="otb">OK to Board</option>
              <option value="boarding">Foto hari H</option>
              <option value="bukti">Bukti bayar</option>
            </select>
            <Input type="file" name="files" accept="application/pdf,image/*" multiple required />
          </div>
          <SubmitButton variant="secondary">Upload</SubmitButton>
        </form>
      </Card>

      <ProofsSection target={{ voaId: id }} back={back} customer={customer} code={v.code} defaultKind={suggestedKind} />

      <PaymentsSection
        target={{ voaId: id }}
        back={back}
        customer={customer}
        label={`VOA ${v.code}`}
        defaultCurrency="USD"
        defaultKind={suggestedKind}
        suggested={half}
      />

      <details className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600">Ubah detail order</summary>
        <form action={updateVoa.bind(null, id)} className="mt-4 space-y-4">
          <VoaFields v={v} tiers={settings.voaTiers} />
        </form>
        {(v.status === "konfirmasi" || v.status === "batal") && (
          <form action={deleteVoa.bind(null, id)} className="mt-4 border-t border-gray-100 pt-4">
            <SubmitButton variant="danger" confirm={`Hapus order ${v.code} permanen?`}>
              Hapus order
            </SubmitButton>
            <p className="mt-1 text-xs text-gray-500">Hanya untuk order yang tidak jadi, tanpa pembayaran.</p>
          </form>
        )}
      </details>
    </>
  );
}
