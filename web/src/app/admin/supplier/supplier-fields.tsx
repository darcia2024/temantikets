import type { schema } from "@/db";
import { Field, Input, Select, Textarea } from "@/components/ui";

type Supplier = typeof schema.suppliers.$inferSelect;

export function SupplierFields({ s }: { s?: Supplier }) {
  return (
    <>
      <Field label="Nama">
        <Input name="name" required defaultValue={s?.name ?? ""} placeholder="Nama konsolidator / agen" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jenis">
          <Select name="kind" defaultValue={s?.kind ?? "konsolidator"}>
            <option value="konsolidator">Konsolidator</option>
            <option value="agen">Agen</option>
            <option value="maskapai">Maskapai langsung</option>
            <option value="lainnya">Lainnya</option>
          </Select>
        </Field>
        <Field label="Mata uang deposit">
          <Select name="currency" defaultValue={s?.currency ?? "IDR"}>
            <option>IDR</option>
            <option>USD</option>
            <option>EGP</option>
          </Select>
        </Field>
      </div>
      <Field label="Peringatan kalau saldo di bawah" hint="Muncul di halaman Hari ini.">
        <Input name="lowBalance" inputMode="decimal" defaultValue={s?.lowBalance ?? ""} />
      </Field>
      <Field label="Catatan">
        <Textarea name="notes" defaultValue={s?.notes ?? ""} placeholder="Kontak, nomor rekening top up, jam operasional..." />
      </Field>
    </>
  );
}
