import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { destroySession, requireOwner } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { appUrl } from "@/lib/wa";

export const metadata = { title: "Lainnya" };

async function logout() {
  "use server";
  await requireOwner();
  await destroySession();
  redirect("/login");
}

const links = [
  { href: "/admin/laporan", title: "Laporan", sub: "Penjualan & margin per maskapai, VOA, konversi, customer pasif" },
  { href: "/admin/kas", title: "Kas & pembayaran", sub: "Tunai EGP belum disetor, transaksi, kurs" },
  { href: "/admin/supplier", title: "Supplier & deposit", sub: "Saldo konsolidator/agen, top up, mutasi" },
  { href: "/admin/request", title: "Request tiket dari website", sub: "Masuk dari form publik" },
  { href: "/admin/import", title: "Import kontak lama", sub: "Dari file .vcf HP atau spreadsheet" },
  { href: "/admin/audit", title: "Audit log", sub: "Siapa mengubah apa dan kapan" },
];

export default async function MorePage() {
  const settings = await getSettings();
  const mandubToken = process.env.MANDUB_TOKEN;
  return (
    <>
      <PageHeader title="Lainnya" />
      <Card className="divide-y divide-gray-100 p-0">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="block px-4 py-3 hover:bg-gray-50">
            <p className="font-medium">{l.title}</p>
            <p className="text-sm text-gray-500">{l.sub}</p>
          </Link>
        ))}
      </Card>

      <SectionTitle>Link untuk dibagikan</SectionTitle>
      <Card className="space-y-3 text-sm">
        <div>
          <p className="font-medium">Form request tiket (untuk customer)</p>
          <a className="break-all text-brand-600 underline" href="/request" target="_blank">
            {appUrl("/request")}
          </a>
        </div>
        <div>
          <p className="font-medium">Papan Mandub (rahasia, hanya untuk tim Kairo)</p>
          {mandubToken ? (
            <a className="break-all text-brand-600 underline" href={`/mandub/${mandubToken}`} target="_blank">
              {appUrl(`/mandub/${mandubToken}`)}
            </a>
          ) : (
            <p className="text-red-700">MANDUB_TOKEN belum diisi.</p>
          )}
        </div>
        <div>
          <p className="font-medium">Lacak Order VOA (untuk customer)</p>
          <a className="break-all text-brand-600 underline" href="/lacak" target="_blank">
            {appUrl("/lacak")}
          </a>
          <p className="text-xs text-gray-500">Customer masukkan kode order (VOA-xxxx-xxxx). Link per order juga ikut di pesan konfirmasi VOA.</p>
        </div>
      </Card>

      <SectionTitle>Tarif VOA</SectionTitle>
      <Card className="text-sm">
        {settings.voaTiers.map((t) => (
          <p key={t.label} className="flex justify-between py-1">
            <span>
              {t.label} ({t.maxPax == null ? `${t.minPax}+` : t.minPax === t.maxPax ? t.minPax : `${t.minPax}-${t.maxPax}`} orang)
            </span>
            <span className="font-medium">{t.rateUsd != null ? `$${t.rateUsd}/orang` : "Nego"}</span>
          </p>
        ))}
      </Card>

      <form action={logout} className="mt-8">
        <SubmitButton variant="secondary" className="w-full">
          Keluar
        </SubmitButton>
      </form>
    </>
  );
}
