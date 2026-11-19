import type { schema } from "@/db";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, Input, Select, SectionTitle } from "@/components/ui";
import { fmtMoney } from "@/lib/money";
import type { Tone } from "@/lib/status";
import { fmtDateTime, routeTimeZone } from "@/lib/time";
import { createChange, updateChange } from "../actions";

type Booking = typeof schema.bookings.$inferSelect;
type Change = typeof schema.bookingChanges.$inferSelect;

const kindLabel: Record<string, string> = { reschedule: "Reschedule", refund: "Refund", ganti_nama: "Ganti nama", lainnya: "Lainnya" };
const statusMeta: Record<string, { label: string; tone: Tone }> = {
  diajukan: { label: "Diajukan", tone: "amber" },
  diproses: { label: "Diproses", tone: "blue" },
  selesai: { label: "Selesai", tone: "green" },
  batal: { label: "Batal", tone: "gray" },
};

export function ChangesSection({ booking: b, changes, hasSupplier }: { booking: Booking; changes: Change[]; hasSupplier: boolean }) {
  const canRequest = ["issued", "perubahan", "berangkat"].includes(b.status);
  if (!canRequest && changes.length === 0) return null;
  const tz = routeTimeZone(b.route);
  return (
    <>
      <SectionTitle>Reschedule / refund</SectionTitle>
      <div className="space-y-2">
        {changes.map((c) => {
          const open = c.status === "diajukan" || c.status === "diproses";
          const owed = (c.airlineFee ?? 0) + (c.serviceFee ?? 0);
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{kindLabel[c.kind] ?? c.kind}</p>
                  {c.kind === "reschedule" && (
                    <p className="text-sm text-gray-600">
                      {fmtDateTime(c.oldDepartAt, tz)} → {fmtDateTime(c.newDepartAt, tz)}
                    </p>
                  )}
                  {c.reason && <p className="text-sm text-gray-600">{c.reason}</p>}
                  <p className="mt-1 text-xs text-gray-500">
                    Biaya maskapai {fmtMoney(c.airlineFee, c.currency)} · biaya layanan {fmtMoney(c.serviceFee, c.currency)}
                    {c.kind === "refund" && ` · refund ke customer ${fmtMoney(c.refundAmount, c.currency)}`}
                  </p>
                  {c.kind !== "refund" && owed > 0 && (
                    <p className="text-xs font-semibold text-amber-800">Tagih customer: {fmtMoney(owed, c.currency)}</p>
                  )}
                </div>
                <Badge tone={statusMeta[c.status].tone}>{statusMeta[c.status].label}</Badge>
              </div>
              {open && (
                <form action={updateChange.bind(null, c.id)} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Biaya maskapai">
                      <Input name="airlineFee" inputMode="decimal" defaultValue={c.airlineFee ?? ""} />
                    </Field>
                    <Field label="Biaya layanan">
                      <Input name="serviceFee" inputMode="decimal" defaultValue={c.serviceFee ?? ""} />
                    </Field>
                    {c.kind === "refund" ? (
                      <Field label="Refund customer">
                        <Input name="refundAmount" inputMode="decimal" defaultValue={c.refundAmount ?? ""} />
                      </Field>
                    ) : (
                      <span />
                    )}
                  </div>
                  {c.kind === "refund" && hasSupplier && (
                    <Field label="Dikembalikan supplier ke deposit" hint="Dalam mata uang deposit supplier. Kosongkan kalau belum ada.">
                      <Input name="supplierRefund" inputMode="decimal" />
                    </Field>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {c.status === "diajukan" && (
                      <SubmitButton variant="secondary" name="status" value="diproses">
                        Diproses
                      </SubmitButton>
                    )}
                    <SubmitButton
                      name="status"
                      value="selesai"
                      confirm={
                        c.kind === "refund"
                          ? "Selesaikan refund? Booking jadi Batal dan refund ke customer dicatat."
                          : "Selesaikan perubahan? Booking kembali Issued dengan jadwal baru."
                      }
                    >
                      Selesai
                    </SubmitButton>
                    <SubmitButton variant="danger" name="status" value="batal" confirm="Batalkan pengajuan ini?">
                      Batalkan pengajuan
                    </SubmitButton>
                  </div>
                </form>
              )}
            </Card>
          );
        })}
      </div>
      {canRequest && (
        <details className="mt-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">+ Ajukan reschedule / refund</summary>
          <form action={createChange.bind(null, b.id)} className="mt-4 space-y-3">
            <Field label="Jenis">
              <Select name="kind" defaultValue="reschedule">
                <option value="reschedule">Reschedule (ganti jadwal)</option>
                <option value="refund">Refund (batal, uang kembali)</option>
                <option value="ganti_nama">Ganti / koreksi nama</option>
                <option value="lainnya">Lainnya</option>
              </Select>
            </Field>
            <Field label="Jadwal baru" hint="Untuk reschedule. Jam lokal bandara asal.">
              <Input name="newDepartAt" type="datetime-local" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Biaya maskapai">
                <Input name="airlineFee" inputMode="decimal" />
              </Field>
              <Field label="Biaya layanan">
                <Input name="serviceFee" inputMode="decimal" />
              </Field>
              <Field label="Refund customer">
                <Input name="refundAmount" inputMode="decimal" />
              </Field>
            </div>
            <Field label="Alasan">
              <Input name="reason" placeholder="Ujian diundur, sakit, dll." />
            </Field>
            <p className="text-xs text-gray-500">Nominal dalam {b.currency}. Bisa diisi atau diubah nanti setelah ada kabar dari maskapai.</p>
            <SubmitButton>Catat pengajuan</SubmitButton>
          </form>
        </details>
      )}
    </>
  );
}
