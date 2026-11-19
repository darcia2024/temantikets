import Link from "next/link";
import { Logo } from "@/components/logo";
import { btn } from "@/components/ui";

const pillars = [
  { title: "Mudah", body: "Pesan dan dapat tiket lewat WhatsApp" },
  { title: "Cepat", body: "Penawaran multi-maskapai, tanpa ribet" },
  { title: "Amanah", body: "Melayani Masisir sejak 2019" },
];

export default function Home() {
  return (
    <main className="bg-sky-hero relative min-h-dvh overflow-hidden">
      <div className="pixel-motif absolute right-6 top-28 text-brand-500/80" aria-hidden />
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 py-8">
        <Logo size={46} />
        <div className="my-auto py-10">
          <p className="text-sm font-bold uppercase tracking-widest text-sky-brand">Jakarta ⇄ Kairo</p>
          <h1 className="mt-2 font-display text-[3.25rem] font-extrabold uppercase italic leading-[0.9] tracking-tight text-brand-700">
            Teman perjalanan <span className="text-brand-500">Masisir</span>
          </h1>
          <div className="mt-3 h-1.5 w-40 -skew-x-12 rounded-full bg-brand-500" aria-hidden />
          <p className="mt-5 text-ink/75">
            Tiket CGK - CAI dari berbagai maskapai, plus <span className="font-semibold text-brand-600">VOA Mesir Express</span>: OK to Board dan dijemput
            Mandub di gate Bandara Kairo.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link href="/request" className={`${btn.primary} py-3.5 text-base`}>
              Request tiket
            </Link>
            <a href="https://voatemantiket.site/" className={`${btn.secondary} py-3.5 text-base`}>
              VOA Mesir Express
            </a>
            <Link href="/lacak" className="mt-1 text-center text-sm font-semibold text-brand-600 underline underline-offset-4">
              Lacak order VOA
            </Link>
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-2 rounded-2xl bg-white/80 p-3 shadow-sm backdrop-blur">
          {pillars.map((p) => (
            <li key={p.title} className="text-center">
              <p className="text-sm font-bold text-brand-600">{p.title}</p>
              <p className="text-[11px] leading-snug text-ink/60">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
