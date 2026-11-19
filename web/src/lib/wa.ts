import { fmtMoney } from "./money";
import { fmtDate, fmtDateTime, fmtDepart, TZ_CAIRO } from "./time";

/** wa.me link with a pre-filled message. The owner still taps "send" in WhatsApp. */
export function waLink(wa: string, text: string): string {
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}

type BookingMsg = {
  code: string;
  route: string;
  airline: string | null;
  departAt: Date | null;
  sellPrice: number | null;
  currency: string;
  timeLimitAt: Date | null;
  pnr: string | null;
};

const sign = "\n\nSalam,\nTemantiket";

export const templates = {
  penawaran: (name: string, b: BookingMsg) =>
    `Assalamualaikum ${name}, berikut penawaran tiket dari Temantiket:\n\n` +
    `Kode: ${b.code}\nRute: ${b.route}\nMaskapai: ${b.airline ?? "-"}\nBerangkat: ${fmtDepart(b)}\n` +
    `Harga: ${fmtMoney(b.sellPrice, b.currency)}\n\nBalas OK kalau mau diproses ya.` +
    sign,

  tagihan: (name: string, b: BookingMsg) =>
    `Assalamualaikum ${name}, tiket ${b.code} (${b.route}, ${b.airline ?? "-"}) sudah kami HOLD.\n\n` +
    `Total: ${fmtMoney(b.sellPrice, b.currency)}\nBatas bayar: ${fmtDateTime(b.timeLimitAt)}\n\n` +
    `Setelah lewat batas ini, kursi bisa lepas dan harga bisa berubah. Kirim bukti transfer ke chat ini ya.` +
    sign,

  tiket: (name: string, b: BookingMsg, fileLinks: string[]) =>
    `Assalamualaikum ${name}, alhamdulillah tiket ${b.code} sudah ISSUED.\n\n` +
    `Rute: ${b.route}\nMaskapai: ${b.airline ?? "-"}\nKode booking (PNR): ${b.pnr ?? "-"}\nBerangkat: ${fmtDepart(b)}\n\n` +
    (fileLinks.length ? `E-ticket (PDF):\n${fileLinks.join("\n")}\n\n` : "") +
    `Mohon cek nama di tiket sudah sesuai paspor. Semoga perjalanannya lancar!` +
    sign,

  reminder: (name: string, b: BookingMsg) =>
    `Assalamualaikum ${name}, pengingat penerbangan ${b.code}:\n\n` +
    `${b.route} - ${b.airline ?? "-"}\nBerangkat: ${fmtDepart(b)}\nPNR: ${b.pnr ?? "-"}\n\n` +
    `Datang ke bandara minimal 3 jam sebelum berangkat. Bawa paspor dan cek kembali jatah bagasi.` +
    sign,

  kwitansi: (name: string, label: string, amount: number, currency: string, link: string) =>
    `Assalamualaikum ${name}, pembayaran ${label} sebesar ${fmtMoney(amount, currency)} sudah kami terima. Terima kasih!\n\n` +
    `Kwitansi: ${link}` +
    sign,
};

type VoaMsg = {
  code: string;
  pax: number;
  totalUsd: number | null;
  arrivalAt: Date | null;
  flightNo: string | null;
};

export const voaTemplates = {
  konfirmasi: (name: string, v: VoaMsg) =>
    `Assalamualaikum ${name}, order VOA Mesir Express Anda sudah kami catat.\n\n` +
    `Kode order: ${v.code}\nJumlah: ${v.pax} orang\nEstimasi biaya: ${fmtMoney(v.totalUsd, "USD")}\n\n` +
    `Mohon kirim foto paspor (masa berlaku min. 6 bulan) dan tiket masuk & keluar Mesir.\n` +
    `Status order bisa dicek di: ${appUrl(`/lacak/${v.code}`)}` +
    sign,

  tagihanDp: (name: string, v: VoaMsg) =>
    `Assalamualaikum ${name}, dokumen untuk ${v.code} sudah lengkap.\n\n` +
    `Silakan bayar DP 50%: ${fmtMoney(v.totalUsd != null ? v.totalUsd / 2 : null, "USD")}\n` +
    `Proses OK to Board dimulai setelah DP masuk (3-4 hari kerja).` +
    sign,

  otb: (name: string, v: VoaMsg, fileLinks: string[]) =>
    `Assalamualaikum ${name}, alhamdulillah OK to Board untuk ${v.code} sudah TERBIT.\n\n` +
    (fileLinks.length ? `${fileLinks.join("\n")}\n\n` : "") +
    `Tunjukkan OK to Board ini saat check-in kalau ditanya soal visa Mesir.\n` +
    `Mohon lunasi sisa biaya: ${fmtMoney(v.totalUsd != null ? v.totalUsd / 2 : null, "USD")}` +
    sign,

  hariH: (name: string, v: VoaMsg) =>
    `Assalamualaikum ${name}, selamat jalan! Setelah dapat boarding pass, kirim ke chat ini:\n` +
    `1. Foto boarding pass\n2. Foto rombongan\n3. Foto koper\n\n` +
    `Mandub kami akan menjemput di gate kedatangan Kairo (${v.flightNo ?? "-"}, ${fmtDateTime(v.arrivalAt, TZ_CAIRO)}).` +
    sign,
};

export function passportWarning(expiry: string | null, travelDate: Date | null): string | null {
  if (!expiry) return null;
  const exp = new Date(expiry + "T00:00:00Z");
  const ref = travelDate ?? new Date();
  const sixMonths = new Date(ref);
  sixMonths.setUTCMonth(sixMonths.getUTCMonth() + 6);
  if (exp < sixMonths) return `Paspor habis ${fmtDate(expiry)}, kurang dari 6 bulan dari tanggal perjalanan`;
  return null;
}
