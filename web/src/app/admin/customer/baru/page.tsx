import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { createCustomer } from "../actions";

export const metadata = { title: "Customer baru" };

export default async function NewCustomerPage({ searchParams }: PageProps<"/admin/customer/baru">) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Customer baru" back="/admin/customer" />
      <Flash sp={sp} />
      <Card>
        <form action={createCustomer} className="space-y-4">
          <Field label="Nama">
            <Input name="name" required autoFocus />
          </Field>
          <Field label="Nomor WhatsApp" hint="Boleh 08xx, +62, atau nomor Mesir 01xx.">
            <Input name="wa" type="tel" inputMode="tel" required />
          </Field>
          <Field label="WA orang tua (opsional)" hint="Untuk kirim tagihan dan tiket ke orang tua.">
            <Input name="waParent" type="tel" inputMode="tel" />
          </Field>
          <Field label="Catatan">
            <Textarea name="notes" placeholder="Kekeluargaan, almamater, kebiasaan maskapai..." />
          </Field>
          <SubmitButton className="w-full">Simpan</SubmitButton>
        </form>
      </Card>
    </>
  );
}
