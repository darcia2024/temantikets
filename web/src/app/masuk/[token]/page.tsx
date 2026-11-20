import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Card, WaButton } from "@/components/ui";
import { consumeLoginToken, peekLoginToken } from "@/lib/member";
import { waLink } from "@/lib/wa";

export const metadata = { title: "Masuk", robots: { index: false } };

async function signIn(token: string) {
  "use server";
  const ok = await consumeLoginToken(token);
  redirect(ok ? "/akun" : "/akun/masuk?error=link");
}

// Opening the link only shows a button; the login happens on tap.
// WhatsApp fetches links for previews, which must not use them up.
export default async function MasukPage({ params }: PageProps<"/masuk/[token]">) {
  const { token } = await params;
  const customer = await peekLoginToken(token);
  const ownerWa = process.env.OWNER_WA;
  return (
    <main className="bg-sky-hero min-h-dvh px-4 py-12">
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={34} />
        </div>
        <Card className="text-center">
          {customer ? (
            <>
              <h1 className="font-display text-3xl font-extrabold uppercase italic text-brand-700">Halo, {customer.name.split(/\s+/)[0]}</h1>
              <p className="mt-2 text-sm text-ink/70">Masuk ke akun Temantiket untuk lihat tiket, OK to Board, poin, dan kirim bukti transfer.</p>
              <form action={signIn.bind(null, token)} className="mt-5">
                <SubmitButton className="w-full">Masuk</SubmitButton>
              </form>
              <p className="mt-3 text-xs text-ink/50">Link ini hanya bisa dipakai sekali. Jangan teruskan ke orang lain.</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-extrabold uppercase italic text-brand-700">Link tidak berlaku</h1>
              <p className="mt-2 text-sm text-ink/70">Link login sudah dipakai atau kedaluwarsa (berlaku 7 hari). Minta link baru lewat WhatsApp.</p>
              {ownerWa && (
                <div className="mt-5">
                  <WaButton href={waLink(ownerWa, "Assalamualaikum Temantiket, saya minta link login akun ya.")}>Minta link baru</WaButton>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
