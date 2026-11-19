import type { schema } from "@/db";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { VoaTier } from "@/lib/settings";
import { AIRLINES } from "@/lib/status";
import { TZ_CAIRO, utcToLocalInput } from "@/lib/time";

type Voa = typeof schema.voaOrders.$inferSelect;

export function VoaFields({ v, tiers, defaultPax }: { v?: Voa; tiers: VoaTier[]; defaultPax?: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jumlah orang">
          <Input name="pax" type="number" min={1} defaultValue={v?.pax ?? defaultPax ?? 1} required />
        </Field>
        <Field label="Tarif USD/orang" hint="Kosongkan = otomatis dari tabel.">
          <Input name="rateUsd" inputMode="decimal" defaultValue={v?.rateUsd ?? ""} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-gray-500">
        Tabel tarif:{" "}
        {tiers.map((t) => `${t.label} ${t.maxPax == null ? `${t.minPax}+` : t.minPax === t.maxPax ? t.minPax : `${t.minPax}-${t.maxPax}`} org: ${t.rateUsd != null ? `$${t.rateUsd}` : "nego"}`).join(" · ")}
      </p>
      <Field label="Jadwal mendarat di Kairo" hint="Waktu Kairo.">
        <Input name="arrivalAt" type="datetime-local" defaultValue={utcToLocalInput(v?.arrivalAt, TZ_CAIRO)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Maskapai">
          <Input name="airline" list="voa-airlines" defaultValue={v?.airline ?? ""} />
          <datalist id="voa-airlines">
            {AIRLINES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="No. penerbangan">
          <Input name="flightNo" defaultValue={v?.flightNo ?? ""} className="uppercase" />
        </Field>
        <Field label="Terminal">
          <Select name="terminal" defaultValue={v?.terminal ?? ""}>
            <option value="">-</option>
            <option>T1</option>
            <option>T2</option>
            <option>T3</option>
          </Select>
        </Field>
      </div>
      <Field label="Catatan">
        <Textarea name="notes" defaultValue={v?.notes ?? ""} placeholder="Umrah transit, wisuda, kebutuhan khusus..." />
      </Field>
      <SubmitButton className="w-full">{v ? "Simpan perubahan" : "Buat order VOA"}</SubmitButton>
    </>
  );
}
