import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { btn } from "@/components/ui";
import { DEFAULT_SETTINGS, getSettings, type VoaTier } from "@/lib/settings";
import { waLink } from "@/lib/wa";

// Tariffs come from settings; refresh the cached page every 10 minutes.
export const revalidate = 600;

async function lacak(formData: FormData) {
  "use server";
  const code = String(formData.get("kode") ?? "").trim().toUpperCase();
  redirect(`/lacak/${encodeURIComponent(code || "-")}`);
}

async function loadTiers(): Promise<VoaTier[]> {
  try {
    return (await getSettings()).voaTiers;
  } catch {
    return DEFAULT_SETTINGS.voaTiers;
  }
}

function paxLabel(t: VoaTier) {
  if (t.maxPax == null) return `${t.minPax}+ orang`;
  if (t.minPax === t.maxPax) return `${t.minPax} orang`;
  return `${t.minPax}-${t.maxPax} orang`;
}

const pillars = [
  { title: "Sejak 2019", body: "Melayani Masisir bertahun-tahun" },
  { title: "Lewat WA", body: "Tanya, pesan, terima tiket di chat" },
  { title: "Multi-maskapai", body: "Pilihan rute & harga dibandingkan" },
];

const ticketSteps = [
  { title: "Kirim request", body: "Isi form request atau chat WA: tanggal, rute, jumlah penumpang." },
  { title: "Terima penawaran", body: "Kami kirim pilihan maskapai, jam terbang, bagasi, dan harga." },
  { title: "Booking & bayar", body: "Kursi kami tahan (HOLD) sampai batas waktu. Bayar sebelum time limit." },
  { title: "E-ticket di WA", body: "Tiket PDF dikirim ke WhatsApp, plus kwitansi digital." },
];

const voaSteps = [
  { title: "Kirim dokumen", body: "Foto paspor dan tiket pesawat ke Kairo." },
  { title: "DP 50%", body: "Order langsung kami proses." },
  { title: "OK to Board", body: "Terbit 3-4 hari kerja, dikirim ke WA. Ini syarat naik pesawat." },
  { title: "Pelunasan", body: "Lunasi sebelum berangkat." },
  { title: "Dijemput Mandub", body: "Mandub menunggu di gate Bandara Kairo dan mengurus VOA sampai keluar." },
];

const faqs = [
  {
    q: "Maskapai apa saja yang tersedia?",
    a: "Kami bandingkan beberapa maskapai untuk rute Jakarta (CGK) ⇄ Kairo (CAI), termasuk yang transit. Pilihan dan harga tergantung tanggal, kirim saja tanggal rencana berangkatmu.",
  },
  {
    q: "Bisa bayar pakai apa?",
    a: "Transfer Rupiah ke rekening Temantiket, atau tunai Pound Mesir (EGP) kalau kamu di Kairo. Setiap pembayaran dapat kwitansi digital.",
  },
  {
    q: "Tiketnya dikirim ke mana?",
    a: "E-ticket berbentuk PDF dikirim langsung ke WhatsApp kamu. Simpan dan tunjukkan saat check-in.",
  },
  {
    q: "Kalau mau ganti jadwal atau batal?",
    a: "Chat kami. Reschedule dan refund mengikuti aturan maskapai; kami bantu urus dan kabari biayanya sebelum diproses.",
  },
  {
    q: "Apa itu OK to Board?",
    a: "Persetujuan yang dibutuhkan maskapai sebelum penumpang VOA boleh terbang ke Mesir. Tanpa OK to Board, kamu bisa ditolak saat check-in.",
  },
  {
    q: "Bagaimana cek status order VOA?",
    a: "Masukkan kode order (contoh VOA-2611-AB3K) di Lacak Order. Statusnya terlihat dari OK to Board sampai penjemputan Mandub.",
  },
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 px-5 py-12">
      <div className="mx-auto max-w-lg">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-500">{eyebrow}</p>
        <h2 className="mt-1 font-display text-4xl font-extrabold uppercase italic leading-[0.95] text-brand-700">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 font-display text-lg font-extrabold italic text-white">
            {i + 1}
          </span>
          <div>
            <p className="font-semibold">{s.title}</p>
            <p className="text-sm text-ink/65">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function Home() {
  const tiers = await loadTiers();
  const ownerWa = process.env.OWNER_WA;
  const waTiket = ownerWa ? waLink(ownerWa, "Assalamualaikum Temantiket, saya mau tanya tiket CGK - CAI.") : null;
  const waVoa = ownerWa ? waLink(ownerWa, "Assalamualaikum Temantiket, saya mau pesan VOA Mesir Express.") : null;

  return (
    <main className="overflow-x-hidden">
      {/* Hero */}
      <header className="bg-sky-hero relative">
        <div className="pixel-motif absolute right-6 top-28 text-brand-500/80" aria-hidden />
        <div className="mx-auto max-w-lg px-6 pb-10 pt-8">
          <div className="flex items-center justify-between">
            <Logo size={40} />
            <nav className="flex gap-3 text-xs font-semibold text-brand-700">
              <a href="#tiket">Tiket</a>
              <a href="#voa">VOA</a>
              <a href="#lacak">Lacak</a>
            </nav>
          </div>
          <div className="py-12">
            <p className="text-sm font-bold uppercase tracking-widest text-sky-brand">Jakarta ⇄ Kairo</p>
            <h1 className="mt-2 font-display text-[3.25rem] font-extrabold uppercase italic leading-[0.9] tracking-tight text-brand-700">
              Teman perjalanan <span className="text-brand-500">Masisir</span>
            </h1>
            <div className="mt-3 h-1.5 w-40 -skew-x-12 rounded-full bg-brand-500" aria-hidden />
            <p className="mt-5 text-ink/75">
              Tiket CGK - CAI dari berbagai maskapai, plus <span className="font-semibold text-brand-600">VOA Mesir Express</span>: OK to Board
              dan dijemput Mandub di gate Bandara Kairo.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Link href="/request" className={`${btn.primary} py-3.5 text-base`}>
                Request tiket
              </Link>
              <a href="#voa" className={`${btn.secondary} py-3.5 text-base`}>
                VOA Mesir Express
              </a>
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
      </header>

      {/* Tiket */}
      <Section id="tiket" eyebrow="Tiket pesawat" title={<>Pesan tiket CGK ⇄ CAI</>}>
        <p className="mb-5 text-ink/75">
          Pulang kampung, balik ke Kairo, atau berangkat pertama kali kuliah. Sekali jalan atau pulang-pergi, sendiri atau rombongan.
        </p>
        <Steps items={ticketSteps} />
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/request" className={`${btn.primary} py-3.5 text-base`}>
            Isi form request tiket
          </Link>
          {waTiket && (
            <a href={waTiket} className={`${btn.secondary} py-3.5 text-base`}>
              Tanya dulu di WhatsApp
            </a>
          )}
        </div>
      </Section>

      {/* VOA */}
      <div className="bg-brand-50">
        <Section id="voa" eyebrow="Visa on Arrival" title={<>VOA Mesir <span className="text-brand-500">Express</span></>}>
          <p className="mb-5 text-ink/75">
            Untuk yang masuk Mesir pakai VOA. Kami urus OK to Board sebelum berangkat, lalu Mandub kami menjemput di gate Bandara Kairo.
          </p>

          <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-brand-100">
            <p className="bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Tarif per orang</p>
            <ul className="divide-y divide-brand-100">
              {tiers.map((t) => (
                <li key={t.label} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-2 text-sm text-ink/55">{paxLabel(t)}</span>
                  </span>
                  <span className="font-display text-2xl font-extrabold italic text-brand-700">
                    {t.rateUsd != null ? `$${t.rateUsd}` : "Nego"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mb-2 text-sm font-semibold">Yang perlu disiapkan</p>
          <ul className="mb-6 list-inside list-disc space-y-1 text-sm text-ink/75">
            <li>Paspor, masa berlaku minimal 6 bulan dari tanggal berangkat</li>
            <li>Tiket pesawat ke Kairo (bisa sekalian pesan di Temantiket)</li>
          </ul>

          <Steps items={voaSteps} />

          {waVoa && (
            <a href={waVoa} className={`${btn.primary} mt-6 w-full py-3.5 text-base`}>
              Pesan VOA via WhatsApp
            </a>
          )}
        </Section>
      </div>

      {/* Lacak */}
      <Section id="lacak" eyebrow="Sudah order VOA?" title="Lacak order">
        <form action={lacak} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
          <label htmlFor="kode" className="text-sm font-medium">
            Kode order
          </label>
          <p className="text-xs text-ink/55">Ada di pesan WhatsApp dari Temantiket.</p>
          <div className="mt-2 flex gap-2">
            <input
              id="kode"
              name="kode"
              required
              placeholder="VOA-2611-AB3K"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <button type="submit" className={`${btn.primary} px-5`}>
              Lacak
            </button>
          </div>
        </form>
      </Section>

      {/* Pembayaran */}
      <div className="bg-brand-50">
        <Section id="bayar" eyebrow="Pembayaran" title="Cara bayar">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
              <p className="font-display text-2xl font-extrabold italic text-brand-700">IDR</p>
              <p className="text-sm text-ink/70">Transfer bank ke rekening Temantiket</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
              <p className="font-display text-2xl font-extrabold italic text-brand-700">EGP</p>
              <p className="text-sm text-ink/70">Tunai di Kairo</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink/65">Nomor rekening hanya diberikan lewat chat WhatsApp resmi Temantiket. Setiap pembayaran dapat kwitansi digital.</p>
        </Section>
      </div>

      {/* FAQ */}
      <Section id="faq" eyebrow="Pertanyaan" title="Sering ditanya">
        <div className="space-y-2">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                {f.q}
                <span className="text-brand-500 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-ink/70">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <footer className="bg-brand-700 px-5 py-10 text-white">
        <div className="mx-auto max-w-lg">
          <Logo size={34} tone="white" />
          <p className="mt-3 text-sm text-white/80">Tiket CGK ⇄ CAI dan VOA Mesir Express untuk Masisir, sejak 2019.</p>
          <div className="mt-5 flex flex-col gap-2 text-sm font-semibold">
            {waTiket && <a href={waTiket}>WhatsApp Temantiket</a>}
            <a href="https://instagram.com/temantiket.co" target="_blank" rel="noopener noreferrer">
              Instagram @temantiket.co
            </a>
            <Link href="/request">Request tiket</Link>
            <a href="#lacak">Lacak order VOA</a>
          </div>
          <p className="mt-8 text-xs text-white/60">© {new Date().getFullYear()} Temantiket</p>
        </div>
      </footer>
    </main>
  );
}
