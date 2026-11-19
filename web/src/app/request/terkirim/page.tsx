import { Logo } from "@/components/logo";
import { Card, WaButton } from "@/components/ui";
import { waLink } from "@/lib/wa";

export const metadata = { title: "Request terkirim" };

export default async function SentPage({ searchParams }: PageProps<"/request/terkirim">) {
  const sp = await searchParams;
  const code = typeof sp.kode === "string" && /^RQ-\d{4}-[A-Z0-9]{4}$/.test(sp.kode) ? sp.kode : null;
  const ownerWa = process.env.OWNER_WA;
  return (
    <main className="bg-sky-hero min-h-dvh px-4 py-12">
     <div className="mx-auto max-w-lg">
      <div className="mb-6 flex justify-center">
        <Logo size={34} />
      </div>
      <Card className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-2xl text-white">✓</div>
        <h1 className="font-display text-3xl font-extrabold uppercase italic text-brand-700">Request terkirim!</h1>
        {code && (
          <p className="mt-1 text-sm text-gray-600">
            Kode request: <span className="font-mono font-semibold">{code}</span>
          </p>
        )}
        <p className="mt-3 text-sm text-gray-600">Biar lebih cepat, kabari kami di WhatsApp. Penawaran dikirim lewat chat.</p>
        {ownerWa && code && (
          <div className="mt-5">
            <WaButton href={waLink(ownerWa, `Assalamualaikum Temantiket, saya baru kirim request tiket. Kode: ${code}`)}>
              Lanjut chat di WhatsApp
            </WaButton>
          </div>
        )}
      </Card>
     </div>
    </main>
  );
}
