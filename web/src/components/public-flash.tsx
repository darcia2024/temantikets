// Public pages (pay link, member area) only show these fixed messages, picked by key.
// Never echo free text from the URL there: a forged link could show
// "transfer ke rekening ..." on a Temantiket page.
export const publicMessages = {
  // errors
  file: "File harus PDF atau foto (JPG/PNG/WEBP/HEIC), maksimal 10 MB.",
  kosong: "Pilih file dulu.",
  nominal: "Isi nominal yang ditransfer.",
  bukti: "Lampirkan foto atau PDF bukti transfer.",
  antre: "Masih ada bukti transfer yang menunggu dicek. Tunggu konfirmasi dulu ya.",
  lunas: "Order ini sudah lunas. Terima kasih!",
  batal: "Order ini sudah dibatalkan.",
  nama: "Isi nama sesuai paspor.",
  tanggal: "Format tanggal tidak valid.",
  tidak_ditemukan: "Data tidak ditemukan.",
  link: "Link login sudah dipakai atau kedaluwarsa. Minta link baru lewat WhatsApp.",
  // success
  terkirim: "Bukti transfer terkirim. Temantiket akan cek dan konfirmasi lewat WhatsApp.",
  tersimpan: "Data tersimpan.",
  diupload: "File terkirim ke Temantiket.",
} as const;

export type PublicMessage = keyof typeof publicMessages;

const pick = (v: string | string[] | undefined) =>
  typeof v === "string" && v in publicMessages ? publicMessages[v as PublicMessage] : null;

export function PublicFlash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const error = pick(sp.error);
  const ok = pick(sp.ok);
  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
          {error}
        </p>
      )}
      {ok && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-100">{ok}</p>}
    </>
  );
}
