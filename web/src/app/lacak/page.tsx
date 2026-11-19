import { redirect } from "next/navigation";
import { Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Lacak Order VOA" };

async function go(formData: FormData) {
  "use server";
  const code = String(formData.get("kode") ?? "").trim().toUpperCase();
  redirect(`/lacak/${encodeURIComponent(code || "-")}`);
}

export default function LacakForm() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-4 text-xl font-bold">Lacak Order VOA</h1>
      <Card>
        <form action={go} className="space-y-3">
          <Field label="Kode order">
            <Input name="kode" placeholder="VOA-2611-AB3K" required className="uppercase" />
          </Field>
          <SubmitButton className="w-full">Lacak</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
