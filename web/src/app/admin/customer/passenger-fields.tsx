import type { schema } from "@/db";
import { Field, Input } from "@/components/ui";

type Passenger = typeof schema.passengers.$inferSelect;

export function PassengerFields({ p }: { p?: Passenger }) {
  return (
    <>
      <Field label="Nama sesuai paspor">
        <Input name="fullName" required defaultValue={p?.fullName ?? ""} className="uppercase" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="No. paspor">
          <Input name="passportNo" defaultValue={p?.passportNo ?? ""} className="uppercase" />
        </Field>
        <Field label="Paspor berlaku s/d">
          <Input name="passportExpiry" type="date" defaultValue={p?.passportExpiry ?? ""} />
        </Field>
      </div>
      <Field label="Tanggal lahir">
        <Input name="birthDate" type="date" defaultValue={p?.birthDate ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isStudent" defaultChecked={p?.isStudent ?? false} className="h-4 w-4" /> Pelajar / mahasiswa Mesir
      </label>
    </>
  );
}
