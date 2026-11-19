# Temantiket — Fase 0

Back-office mobile-first untuk owner Temantiket: booking tiket CGK - CAI, VOA Mesir Express, kas (termasuk tunai EGP), dan WhatsApp lewat link `wa.me`. Rencana lengkapnya ada di PRD.

## Isi Fase 0

| Bagian | URL | Untuk |
| --- | --- | --- |
| Hari ini | `/admin` | Time limit HOLD, request baru, VOA yang perlu tindakan, keberangkatan 3 hari ke depan |
| Tiket | `/admin/tiket` | Booking, status, upload PDF e-ticket, tombol WA (penawaran, tagihan, e-ticket, reminder) |
| VOA | `/admin/voa` | Order VOA: checklist dokumen, DP 50%, OK to Board (3-4 hari kerja), pelunasan |
| Customer | `/admin/customer` | Data customer dan paspor penumpang, peringatan paspor < 6 bulan |
| Kas | `/admin/kas` | Pembayaran, saldo tunai per pemegang, setoran, kurs |
| Reschedule/refund | di detail booking | Pengajuan perubahan, biaya maskapai & layanan, refund ke customer; jadwal dan status booking ikut berubah saat selesai |
| Supplier | `/admin/supplier` | Saldo deposit konsolidator/agen; otomatis terpotong harga modal saat Issued, biaya perubahan ikut tercatat; peringatan saldo menipis |
| Laporan | `/admin/laporan` | Penjualan & margin per maskapai, VOA, uang masuk, konversi request, alasan batal, customer pasif > 12 bulan |
| Audit log | `/admin/audit` | Semua perubahan data: siapa (owner/mandub), apa, kapan, nilai sebelum & sesudah |
| Import | `/admin/import` | Import kontak lama dari `.vcf` HP atau CSV |
| Form request | `/request` | Form publik untuk customer, lanjut ke WA owner |
| Papan Mandub | `/mandub/<MANDUB_TOKEN>` | Jadwal kedatangan di Kairo, tanpa login, update status penjemputan |
| Lacak Order | `/lacak/<kode>` dan `GET /api/lacak/<kode>` | Status VOA untuk customer dan untuk voatemantiket.site |
| Kwitansi | `/kwitansi/<token>` | Kwitansi digital untuk dikirim lewat WA |

## Jalankan di laptop

```powershell
npm install
copy .env.example .env.local   # lalu isi; lihat penjelasan di file
npm run db:seed                # opsional: data contoh
npm run dev
```

Buka http://localhost:3000/admin dan login pakai `ADMIN_PASSWORD`.
Lokal memakai PGlite (Postgres di dalam Node, disimpan di `.data/`), jadi tidak perlu Docker. Migrasi jalan otomatis.
`db:seed` harus dijalankan saat dev server mati (PGlite hanya bisa dibuka satu proses).

## Deploy (Neon + Vercel)

1. Push folder `web/` ke GitHub, lalu import repo-nya ke Vercel (Root Directory: `web`).
2. Di project Vercel: **Storage → Create → Neon**, region terdekat (Singapore). Vercel otomatis mengisi
   `DATABASE_URL` (pooled) dan `DATABASE_URL_UNPOOLED` (direct).
   Tanpa Vercel: buat project di neon.tech, salin connection string *pooled* ke `DATABASE_URL` dan yang *direct* ke `DATABASE_URL_UNPOOLED`.
3. Jalankan migrasi dari laptop (pakai connection string *direct*):
   ```powershell
   $env:DATABASE_URL_UNPOOLED="postgresql://..."; npm run db:migrate
   ```
   Ulangi setiap ada file baru di folder `drizzle/`.
4. Isi variabel lain dari `.env.example` di Vercel (pakai secret baru, jangan yang lokal) dan set `APP_URL` ke domain produksi. Lalu redeploy.
5. Alarm time limit: panggil `GET /api/cron/reminders` setiap 15 menit dengan header `Authorization: Bearer <CRON_SECRET>`.
   Vercel Cron versi gratis hanya sekali sehari, jadi pakai cron-job.org (gratis).
6. Buka `/admin` di HP → Share → Add to Home Screen, lalu tekan "Aktifkan notifikasi" di halaman Hari ini.

Catatan Neon:
- Paket gratis menidurkan database saat sepi; request pertama sesudahnya bisa lebih lambat sesaat (timeout koneksi sudah dilonggarkan).
- File (PDF, foto) sekarang disimpan di database dan memakan kuota storage Neon. Pindahkan ke Vercel Blob sebelum volumenya besar.
- Migrasi RLS (`0001`, `0003`) aman di Neon: menutup tabel dari Data API Neon kalau suatu saat diaktifkan.

## Sambungkan Lacak Order di voatemantiket.site

```js
const res = await fetch(`https://<APP_URL>/api/lacak/${kode}`);
const data = await res.json(); // { statusLabel, steps: [{ label, done, current }], arrivalAt, flightNo, mandub }
```

Origin yang diizinkan diatur lewat `LACAK_ALLOWED_ORIGINS`. Respons tidak berisi nama, nomor WA, atau data paspor.

## Tes

```powershell
npm test
```

Tes unit (nomor WA, parsing nominal, zona waktu WIB/Kairo, tarif VOA, import kontak, laporan) dan tes database
(semua migrasi di Postgres in-memory, RLS di semua tabel, constraint, potong deposit supplier tidak dobel, upload file, API Lacak).

## Catatan teknis

- Validasi di Server Action pakai `fail("pesan")` di dalam `guard()`: pesannya muncul di halaman (`?error=`), bukan halaman error umum.
- Setiap aksi yang mengubah data memanggil `audit()`.

- Next.js 16 (App Router, Server Actions, `proxy.ts`), Drizzle ORM, Tailwind v4.
- Ubah skema di `src/db/schema.ts`, lalu `npm run db:generate` untuk membuat migrasi baru.
- File (PDF tiket, OTB, foto) disimpan di tabel `files` (maks. 10 MB per file). Saat volume besar, pindahkan ke Vercel Blob.
- Waktu: time limit diisi dalam WIB, jam berangkat dalam waktu bandara asal, jam tiba VOA dalam waktu Kairo. Semua disimpan sebagai UTC.
