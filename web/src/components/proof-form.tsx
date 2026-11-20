import type { Currency } from "@/db/schema";
import { fmtMoney } from "@/lib/money";
import { SubmitButton } from "./submit-button";
import { Field, Input, Select, Textarea } from "./ui";

/** Bank details from settings, or a hint to ask on WhatsApp. */
export function BankInfo({ accounts }: { accounts: string }) {
  if (!accounts.trim()) {
    return <p className="text-sm text-ink/70">Nomor rekening diberikan lewat chat WhatsApp resmi Temantiket.</p>;
  }
  return (
    <div>
      <p className="text-sm font-medium">Transfer ke</p>
      <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-brand-50 p-3 font-sans text-sm text-ink ring-1 ring-brand-100">{accounts.trim()}</pre>
      <p className="mt-1 text-xs text-ink/55">Pastikan nama penerima sesuai. Temantiket tidak pernah meminta transfer ke rekening pribadi lain.</p>
    </div>
  );
}

/** Upload a transfer receipt. `action` is a bound Server Action. */
export function ProofForm({ action, suggested }: { action: (fd: FormData) => Promise<void>; suggested: { amount: number | null; currency: Currency } }) {
  // Most transfers are in Rupiah; for USD orders we leave the amount for the payer to fill.
  const defaultAmount = suggested.currency === "IDR" && suggested.amount ? String(suggested.amount) : "";
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Mata uang">
          <Select name="currency" defaultValue="IDR">
            <option>IDR</option>
            <option>EGP</option>
            <option>USD</option>
          </Select>
        </Field>
        <div className="col-span-2">
          <Field label="Nominal ditransfer">
            <Input name="amount" inputMode="decimal" required defaultValue={defaultAmount} placeholder="1.500.000" />
          </Field>
        </div>
      </div>
      {suggested.currency !== "IDR" && suggested.amount != null && (
        <p className="-mt-1 text-xs text-ink/55">Tagihan dalam {fmtMoney(suggested.amount, suggested.currency)}. Untuk transfer Rupiah, tanyakan kurs hari ini lewat WhatsApp.</p>
      )}
      <Field label="Nama pengirim (sesuai rekening)">
        <Input name="payerName" autoComplete="name" />
      </Field>
      <Field label="Foto / PDF bukti transfer">
        <Input type="file" name="bukti" accept="application/pdf,image/*" required />
      </Field>
      <Field label="Catatan (opsional)">
        <Textarea name="note" rows={2} placeholder="Misal: DP, pelunasan, transfer dari rekening ayah" />
      </Field>
      <SubmitButton className="w-full">Kirim bukti transfer</SubmitButton>
    </form>
  );
}
