import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getDb, schema } from "@/db";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { newRequestCode } from "@/lib/codes";
import { int, str } from "@/lib/form";
import { normalizeReferralCode } from "@/lib/member";
import { normalizeWa } from "@/lib/phone";

export const metadata = {
  title: "Request tiket CGK - CAI",
  description: "Kirim kebutuhan tiket Jakarta - Kairo, Temantiket carikan opsi maskapai terbaik.",
};

async function submitRequest(formData: FormData) {
  "use server";
  // Honeypot: real people never fill this hidden field.
  if (str(formData, "website")) redirect("/request/terkirim");
  const wa = normalizeWa(str(formData, "wa"));
  const name = str(formData, "name");
  const departDate = str(formData, "departDate");
  const route = str(formData, "route");
  if (!wa || !name || !departDate || !route || !["CGK-CAI", "CAI-CGK"].includes(route)) redirect("/request?error=1");
  const priority = str(formData, "priority") ?? "termurah";
  const db = await getDb();
  const code = newRequestCode();
  await db.insert(schema.ticketRequests).values({
    code,
    name: name.slice(0, 120),
    wa,
    route,
    departDate,
    returnDate: str(formData, "returnDate"),
    flexDays: Math.min(Math.max(int(formData, "flexDays", 0), 0), 14),
    pax: Math.min(Math.max(int(formData, "pax", 1), 1), 99),
    priority: ["termurah", "bagasi", "tercepat", "maskapai"].includes(priority) ? priority : "termurah",
    wantsVoa: formData.get("wantsVoa") === "on",
    notes: str(formData, "notes")?.slice(0, 1000) ?? null,
    referralCode: normalizeReferralCode(str(formData, "ref")),
  });
  redirect(`/request/terkirim?kode=${code}`);
}

export default async function RequestPage({ searchParams }: PageProps<"/request">) {
  const sp = await searchParams;
  const ref = normalizeReferralCode(typeof sp.ref === "string" ? sp.ref : null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="bg-sky-hero min-h-dvh">
     <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/">
        <Logo size={32} />
      </Link>
      <h1 className="mt-6 font-display text-5xl font-extrabold uppercase italic leading-[0.9] tracking-tight text-brand-700">
        Request tiket <span className="text-brand-500">Jakarta - Kairo</span>
      </h1>
      <div className="mt-3 h-1.5 w-32 -skew-x-12 rounded-full bg-brand-500" aria-hidden />
      <p className="mt-3 text-sm text-ink/70">Isi kebutuhan lo, kami carikan opsi maskapai dan kirim penawarannya lewat WhatsApp.</p>
      {sp.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Cek lagi nama, nomor WA, rute, dan tanggal.</p>}
      <Card className="mt-6">
        <form action={submitRequest} className="space-y-4">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <Field label="Nama">
            <Input name="name" required autoComplete="name" />
          </Field>
          <Field label="Nomor WhatsApp" hint="Nomor Indonesia atau Mesir.">
            <Input name="wa" type="tel" inputMode="tel" required autoComplete="tel" />
          </Field>
          <Field label="Rute">
            <Select name="route" defaultValue="CGK-CAI">
              <option value="CGK-CAI">Jakarta → Kairo</option>
              <option value="CAI-CGK">Kairo → Jakarta</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal berangkat">
              <Input name="departDate" type="date" min={today} required />
            </Field>
            <Field label="Fleksibel">
              <Select name="flexDays" defaultValue="3">
                <option value="0">Tanggal pas</option>
                <option value="3">± 3 hari</option>
                <option value="7">± 1 minggu</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal pulang (opsional)">
              <Input name="returnDate" type="date" min={today} />
            </Field>
            <Field label="Jumlah orang">
              <Input name="pax" type="number" min={1} max={99} defaultValue={1} required />
            </Field>
          </div>
          <Field label="Yang paling penting">
            <Select name="priority" defaultValue="termurah">
              <option value="termurah">Harga termurah</option>
              <option value="bagasi">Bagasi terbesar</option>
              <option value="tercepat">Transit tersingkat</option>
              <option value="maskapai">Maskapai tertentu</option>
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="wantsVoa" className="mt-0.5 h-4 w-4" />
            <span>
              Sekalian <span className="font-medium">VOA Mesir Express</span>: OK to Board + dijemput Mandub di gate Bandara Kairo
            </span>
          </label>
          <Field label="Catatan">
            <Textarea name="notes" placeholder="Maba / mahasiswa lama, maskapai favorit, bagasi tambahan..." />
          </Field>
          <Field label="Kode ajakan teman (opsional)">
            <Input name="ref" defaultValue={ref ?? ""} className="uppercase" autoCapitalize="characters" maxLength={12} />
          </Field>
          <SubmitButton className="w-full">Kirim request</SubmitButton>
        </form>
      </Card>
     </div>
    </main>
  );
}
