import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Input } from "@/components/ui";

export const metadata = { title: "Lacak Order VOA", description: "Cek status OK to Board dan penjemputan Mandub di Bandara Kairo." };

async function go(formData: FormData) {
  "use server";
  const code = String(formData.get("kode") ?? "").trim().toUpperCase();
  redirect(`/lacak/${encodeURIComponent(code || "-")}`);
}

export default function LacakForm() {
  return (
    <main className="bg-sky-hero min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-md">
        <Logo size={30} />
        <h1 className="mt-6 font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Lacak Order VOA</h1>
        <p className="mb-4 mt-1 text-sm text-ink/60">Cek status OK to Board dan penjemputan Mandub di Bandara Kairo.</p>
        <Card>
          <form action={go} className="space-y-3">
            <Field label="Kode order" hint="Ada di pesan WhatsApp dari Temantiket, contoh VOA-2611-AB3K.">
              <Input name="kode" placeholder="VOA-2611-AB3K" required autoCapitalize="characters" className="uppercase" />
            </Field>
            <SubmitButton className="w-full">Lacak</SubmitButton>
          </form>
        </Card>
      </div>
    </main>
  );
}
