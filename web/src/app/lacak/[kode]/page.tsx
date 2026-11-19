import Link from "next/link";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { lacakOrder } from "@/lib/lacak";
import { fmtDateTime, TZ_CAIRO } from "@/lib/time";

export const metadata = { title: "Lacak Order VOA", robots: { index: false } };

export default async function LacakPage({ params }: PageProps<"/lacak/[kode]">) {
  const { kode } = await params;
  const r = await lacakOrder(decodeURIComponent(kode));
  return (
    <main className="bg-sky-hero min-h-dvh px-4 py-8">
     <div className="mx-auto max-w-md">
      <Logo size={30} />
      <h1 className="mt-6 font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Lacak Order VOA</h1>
      <p className="mb-4 mt-1 text-sm text-ink/60">VOA Mesir Express</p>
      {!r ? (
        <Card>
          <p className="text-sm">Kode order tidak ditemukan. Cek lagi kode dari admin (contoh: VOA-2611-AB3K).</p>
          <Link href="/lacak" className="mt-3 inline-block text-sm text-brand-600 underline">
            Coba kode lain
          </Link>
        </Card>
      ) : (
        <Card>
          <p className="font-mono text-sm text-gray-500">{r.code}</p>
          <p className="mt-1 text-lg font-semibold">{r.statusLabel}</p>
          {r.arrivalAt && (
            <p className="text-sm text-gray-600">
              Jadwal tiba: {fmtDateTime(new Date(r.arrivalAt), TZ_CAIRO)}
              {r.flightNo ? ` · ${r.flightNo}` : ""}
            </p>
          )}
          {!r.cancelled && (
            <ol className="mt-5 space-y-3">
              {r.steps.map((s) => (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      s.done ? "bg-brand-500 text-white" : s.current ? "bg-sky-brand text-white ring-4 ring-sky-soft/60" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {s.done ? "✓" : ""}
                  </span>
                  <span className={s.current ? "font-semibold" : s.done ? "text-gray-700" : "text-gray-400"}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-5 text-xs text-gray-400">Terakhir diperbarui {fmtDateTime(new Date(r.updatedAt))}</p>
        </Card>
      )}
     </div>
    </main>
  );
}
