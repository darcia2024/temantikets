import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { audit } from "@/lib/action";
import { requireOwner } from "@/lib/auth";
import { parseContacts } from "@/lib/contacts";

export const metadata = { title: "Import kontak" };

async function importContacts(formData: FormData) {
  "use server";
  await requireOwner();
  const file = formData.get("file");
  let text = String(formData.get("text") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) redirect("/admin/import?error=besar");
    text += "\n" + (await file.text());
  }
  // Only contacts whose name contains the keyword, e.g. "masisir" or "tt"
  const keyword = String(formData.get("keyword") ?? "").trim().toLowerCase();
  let contacts = parseContacts(text);
  if (keyword) contacts = contacts.filter((c) => c.name.toLowerCase().includes(keyword));
  if (contacts.length === 0) redirect("/admin/import?result=0-0");

  const db = await getDb();
  let added = 0;
  for (let i = 0; i < contacts.length; i += 500) {
    const chunk = contacts.slice(i, i + 500);
    const existing = await db
      .select({ wa: schema.customers.wa })
      .from(schema.customers)
      .where(inArray(schema.customers.wa, chunk.map((c) => c.wa)));
    const known = new Set(existing.map((e) => e.wa));
    const fresh = chunk.filter((c) => !known.has(c.wa));
    if (fresh.length) {
      await db
        .insert(schema.customers)
        .values(fresh.map((c) => ({ name: c.name, wa: c.wa, source: "import" })))
        .onConflictDoNothing();
      added += fresh.length;
    }
  }
  await audit("customer", null, "import", null, { found: contacts.length, added, keyword: keyword || null });
  revalidatePath("/admin/customer");
  redirect(`/admin/import?result=${added}-${contacts.length - added}`);
}

export default async function ImportPage({ searchParams }: PageProps<"/admin/import">) {
  const sp = await searchParams;
  const [added, skipped] = typeof sp.result === "string" ? sp.result.split("-") : [];
  return (
    <>
      <PageHeader title="Import kontak lama" back="/admin/customer" />
      {added !== undefined && (
        <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          {added} customer baru ditambahkan, {skipped} dilewati karena sudah ada.
        </p>
      )}
      {sp.error === "besar" && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">File lebih dari 5 MB.</p>}
      <Card className="mb-4 text-sm text-gray-700">
        <p className="font-semibold">Cara ekspor kontak dari HP</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Android: aplikasi Kontak → Kelola kontak → Ekspor → file .vcf</li>
          <li>iPhone: icloud.com → Kontak → pilih semua → Ekspor vCard</li>
          <li>Atau tempel daftar &quot;nama, nomor&quot; per baris dari spreadsheet.</li>
        </ul>
      </Card>
      <Card>
        <form action={importContacts} className="space-y-4">
          <Field label="File kontak (.vcf atau .csv)">
            <Input type="file" name="file" accept=".vcf,.csv,.txt,text/vcard,text/csv" />
          </Field>
          <Field label="Atau tempel di sini">
            <Textarea name="text" rows={5} placeholder={"Ahmad Fauzi, 081234567890\nSiti, +20 100 000 0000"} />
          </Field>
          <Field label="Hanya nama yang mengandung (opsional)" hint='Contoh: "TT" kalau kontak customer lo diberi penanda di namanya.'>
            <Input name="keyword" />
          </Field>
          <SubmitButton className="w-full">Import</SubmitButton>
        </form>
      </Card>
    </>
  );
}
