import type { BookingStatus, MandubStatus, VoaStatus } from "@/db/schema";

type Meta = { label: string; tone: Tone };
export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "violet";

export const bookingStatusMeta: Record<BookingStatus, Meta> = {
  penawaran: { label: "Penawaran", tone: "gray" },
  hold: { label: "HOLD", tone: "amber" },
  dibayar: { label: "Dibayar", tone: "blue" },
  issued: { label: "Issued", tone: "green" },
  berangkat: { label: "Berangkat", tone: "violet" },
  selesai: { label: "Selesai", tone: "gray" },
  perubahan: { label: "Perubahan", tone: "violet" },
  batal: { label: "Batal", tone: "red" },
};

// Allowed next statuses, mirrors the flow in the PRD.
export const bookingNext: Record<BookingStatus, BookingStatus[]> = {
  penawaran: ["hold", "batal"],
  hold: ["dibayar", "penawaran", "batal"],
  dibayar: ["issued", "batal"],
  // Reschedule/refund go through the "Reschedule / refund" section, which records fees.
  issued: ["berangkat"],
  berangkat: ["selesai"],
  selesai: [],
  perubahan: ["issued", "batal"],
  batal: [],
};

export const voaStatusMeta: Record<VoaStatus, Meta & { public: string }> = {
  konfirmasi: { label: "Konfirmasi", tone: "gray", public: "Order dikonfirmasi" },
  dokumen: { label: "Dokumen lengkap", tone: "blue", public: "Dokumen diterima" },
  dp: { label: "DP masuk", tone: "amber", public: "DP diterima, OK to Board diproses" },
  otb_terbit: { label: "OTB terbit", tone: "blue", public: "OK to Board terbit" },
  lunas: { label: "Lunas", tone: "green", public: "Lunas, siap berangkat" },
  dijemput: { label: "Dijemput", tone: "violet", public: "Dijemput Mandub di Bandara Kairo" },
  selesai: { label: "Selesai", tone: "gray", public: "Selesai, selamat datang di Kairo" },
  batal: { label: "Batal", tone: "red", public: "Order dibatalkan" },
};

export const voaNext: Record<VoaStatus, VoaStatus[]> = {
  konfirmasi: ["dokumen", "batal"],
  dokumen: ["dp", "batal"],
  dp: ["otb_terbit", "batal"],
  otb_terbit: ["lunas", "batal"],
  lunas: ["dijemput"],
  dijemput: ["selesai"],
  selesai: [],
  batal: [],
};

export const VOA_PUBLIC_STEPS: VoaStatus[] = ["konfirmasi", "dokumen", "dp", "otb_terbit", "lunas", "dijemput", "selesai"];

export const mandubStatusMeta: Record<MandubStatus, Meta> = {
  belum: { label: "Belum tiba", tone: "gray" },
  menunggu_gate: { label: "Menunggu di gate", tone: "amber" },
  voa_beres: { label: "VOA beres", tone: "blue" },
  keluar: { label: "Keluar bandara", tone: "green" },
};

export const ROUTES = ["CGK-CAI", "CAI-CGK"] as const;
export const AIRLINES = ["Saudia", "Emirates", "Qatar Airways", "Etihad", "Turkish Airlines", "EgyptAir", "Oman Air", "flyadeal", "Lainnya"];
