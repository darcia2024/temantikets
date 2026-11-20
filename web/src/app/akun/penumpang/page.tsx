import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PassengerFields } from "@/app/admin/customer/passenger-fields";
import { PublicFlash } from "@/components/public-flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Input, SectionTitle } from "@/components/ui";
import { requireMember } from "@/lib/member";
import { fmtDate } from "@/lib/time";
import { passportWarning } from "@/lib/wa";
import { savePassenger, uploadPassport } from "../actions";

export const metadata = { title: "Penumpang tersimpan" };

export default async function PenumpangPage({ searchParams }: PageProps<"/akun/penumpang">) {
  const me = await requireMember();
  const sp = await searchParams;
  const db = await getDb();
  const pax = await db.select().from(schema.passengers).where(eq(schema.passengers.customerId, me.id)).orderBy(asc(schema.passengers.id));
  const photos = pax.length
    ? await db
        .select({ passengerId: schema.files.passengerId, shareToken: schema.files.shareToken, filename: schema.files.filename })
        .from(schema.files)
        .where(inArray(schema.files.passengerId, pax.map((p) => p.id)))
    : [];

  return (
    <>
      <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Penumpang</h1>
      <p className="mb-4 mt-1 text-sm text-ink/60">Data paspor yang tersimpan, jadi tidak perlu kirim ulang tiap pesan tiket.</p>
      <PublicFlash sp={sp} />

      {pax.length === 0 ? (
        <Empty>Belum ada penumpang tersimpan. Tambahkan di bawah.</Empty>
      ) : (
        <div className="space-y-3">
          {pax.map((p) => {
            const warn = passportWarning(p.passportExpiry, null);
            const mine = photos.filter((f) => f.passengerId === p.id);
            return (
              <Card key={p.id}>
                <p className="font-semibold">
                  {p.fullName} {p.isStudent && <Badge tone="blue">Pelajar</Badge>}
                </p>
                <p className="text-sm text-ink/60">
                  Paspor {p.passportNo ?? "-"} · berlaku s/d {fmtDate(p.passportExpiry)}
                </p>
                {warn && <p className="mt-1 text-xs font-medium text-red-700">{warn}</p>}
                <p className="mt-2 text-xs text-ink/55">
                  Foto paspor:{" "}
                  {mine.length === 0
                    ? "belum ada"
                    : mine.map((f, i) => (
                        <a key={f.shareToken} href={`/f/${f.shareToken}`} target="_blank" className="text-brand-600 underline">
                          {i > 0 ? ", " : ""}
                          {f.filename}
                        </a>
                      ))}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-700">Ubah data / upload foto paspor</summary>
                  <form action={savePassenger.bind(null, p.id)} className="mt-3 space-y-3">
                    <PassengerFields p={p} />
                    <SubmitButton variant="secondary">Simpan</SubmitButton>
                  </form>
                  <form action={uploadPassport.bind(null, p.id)} className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                    <Input type="file" name="files" accept="application/pdf,image/*" required />
                    <SubmitButton variant="secondary">Upload foto paspor</SubmitButton>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Tambah penumpang</SectionTitle>
      <Card>
        <form action={savePassenger.bind(null, null)} className="space-y-3">
          <PassengerFields />
          <SubmitButton className="w-full">Simpan penumpang</SubmitButton>
        </form>
      </Card>
    </>
  );
}
