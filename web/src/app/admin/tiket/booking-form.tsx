import type { schema } from "@/db";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AIRLINES, ROUTES } from "@/lib/status";
import { routeTimeZone, TZ_WIB, utcToLocalInput } from "@/lib/time";

type Booking = typeof schema.bookings.$inferSelect;
type Supplier = { id: number; name: string };

export function BookingFields({ b, defaultRoute, suppliers }: { b?: Booking; defaultRoute?: string; suppliers: Supplier[] }) {
  const route = b?.route ?? defaultRoute ?? "CGK-CAI";
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rute">
          <Select name="route" defaultValue={route}>
            {ROUTES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Maskapai">
          <Input name="airline" list="airlines" defaultValue={b?.airline ?? ""} />
          <datalist id="airlines">
            {AIRLINES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Berangkat" hint="Jam lokal bandara asal (WIB untuk CGK, waktu Kairo untuk CAI).">
        <Input name="departAt" type="datetime-local" defaultValue={utcToLocalInput(b?.departAt, routeTimeZone(route))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PNR / kode booking">
          <Input name="pnr" defaultValue={b?.pnr ?? ""} className="uppercase" />
        </Field>
        <Field label="Supplier" hint={suppliers.length === 0 ? "Tambah di Lainnya → Supplier" : undefined}>
          <Select name="supplierId" defaultValue={b?.supplierId ?? ""}>
            <option value="">{b?.supplier && !b.supplierId ? `${b.supplier} (lama)` : "-"}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Time limit (WIB)" hint="Isi PNR + time limit untuk langsung jadi HOLD dan muncul alarm.">
        <Input name="timeLimitAt" type="datetime-local" defaultValue={utcToLocalInput(b?.timeLimitAt, TZ_WIB)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Mata uang">
          <Select name="currency" defaultValue={b?.currency ?? "IDR"}>
            <option>IDR</option>
            <option>USD</option>
            <option>EGP</option>
          </Select>
        </Field>
        <Field label="Harga modal">
          <Input name="costPrice" inputMode="decimal" defaultValue={b?.costPrice ?? ""} />
        </Field>
        <Field label="Harga jual">
          <Input name="sellPrice" inputMode="decimal" defaultValue={b?.sellPrice ?? ""} />
        </Field>
      </div>
      <Field label="Nomor tiket" hint="Pisahkan dengan koma jika lebih dari satu.">
        <Input name="ticketNumbers" defaultValue={b?.ticketNumbers ?? ""} />
      </Field>
      <Field label="Catatan">
        <Textarea name="notes" defaultValue={b?.notes ?? ""} placeholder="Bagasi, permintaan khusus..." />
      </Field>
      <SubmitButton className="w-full">{b ? "Simpan perubahan" : "Buat booking"}</SubmitButton>
    </>
  );
}
