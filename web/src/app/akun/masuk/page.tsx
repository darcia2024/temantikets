import { redirect } from "next/navigation";
import { PublicFlash } from "@/components/public-flash";
import { Card, WaButton } from "@/components/ui";
import { getMember } from "@/lib/member";
import { waLink } from "@/lib/wa";

export const metadata = { title: "Masuk akun" };

export default async function AkunMasuk({ searchParams }: PageProps<"/akun/masuk">) {
  if (await getMember()) redirect("/akun");
  const sp = await searchParams;
  const ownerWa = process.env.OWNER_WA;
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Akun Temantiket</h1>
      <p className="mb-4 mt-1 text-sm text-ink/60">Tiket, OK to Board, penumpang tersimpan, dan poin di satu tempat.</p>
      <PublicFlash sp={sp} />
      <Card className="space-y-3 text-sm text-ink/75">
        <p className="font-semibold text-ink">Cara masuk</p>
        <ol className="list-inside list-decimal space-y-1">
          <li>Chat Temantiket di WhatsApp dari nomor yang kamu pakai saat pesan.</li>
          <li>Kami kirim link login khusus untukmu.</li>
          <li>Buka link itu, tekan Masuk. Tidak perlu password.</li>
        </ol>
        {ownerWa && (
          <div className="pt-2">
            <WaButton href={waLink(ownerWa, "Assalamualaikum Temantiket, saya minta link login akun ya.")}>Minta link login</WaButton>
          </div>
        )}
      </Card>
    </>
  );
}
