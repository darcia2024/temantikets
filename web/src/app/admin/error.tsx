"use client";

import { useEffect } from "react";

// Unexpected failures only. Validation messages are shown in-page via guard().
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = (error as { digest?: string })?.digest;
  return (
    <div className="mt-10 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-red-100">
      <p className="font-display text-3xl font-extrabold uppercase italic text-red-700">Ada yang gagal</p>
      <p className="mt-2 text-sm text-gray-600">
        Perubahan terakhir mungkin belum tersimpan. Coba lagi. Kalau tetap gagal, catat kode di bawah dan kirim ke developer.
      </p>
      {digest && <p className="mt-2 font-mono text-xs text-gray-400">Kode: {digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => retry()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
          Coba lagi
        </button>
        <a href="/admin" className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-700 ring-2 ring-brand-500">
          Ke Hari ini
        </a>
      </div>
    </div>
  );
}
