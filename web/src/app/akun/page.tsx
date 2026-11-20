import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PublicFlash } from "@/components/public-flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge, btn, Card, Empty, Input, SectionTitle } from "@/components/ui";
import { requireMember } from "@/lib/member";
import { fmtMoney } from "@/lib/money";
import { ensurePayToken, orderBalance } from "@/lib/payments";
import { pointBalance } from "@/lib/points";
import { getSettings } from "@/lib/settings";
import { bookingStatusMeta, voaStatusMeta } from "@/lib/status";
import { fmtDateTime, fmtDepart, TZ_CAIRO } from "@/lib/time";
import { appUrl } from "@/lib/wa";
import { uploadVoaDocs } from "./actions";

export const metadata = { title: "Akun saya" };

const DONE_BOOKING = ["selesai", "batal"];
const DONE_VOA = ["selesai", "batal"];

type FileRow = { kind: string; filename: string; shareToken: string; bookingId: number | null; voaId: number | null };

function Files({ files, label }: { files: FileRow[]; label: string }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</p>
      <ul className="mt-1 space-y-1">
        {files.map((f) => (
          <li key={f.shareToken}>
            <a href={`/f/${f.shareToken}`} target="_blank" className="text-sm font-medium text-brand-600 underline">
              {f.filename}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PayLinks({ token, due, currency, parentWa }: { token: string; due: number | null; currency: "IDR" | "USD" | "EGP"; parentWa: string | null }) {
  const url = appUrl(`/bayar/${token}`);
  const msg = `Assalamualaikum, ini link pembayaran Temantiket (sisa ${fmtMoney(due, currency)}): ${url}`;
  // wa.me without a number lets the customer pick a contact (e.g. a parent).
  const share = `https://wa.me/${parentWa ?? ""}?text=${encodeURIComponent(msg)}`;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Link href={`/bayar/${token}`} className={`${btn.primary} !py-2`}>
        Bayar / kirim bukti
      </Link>
      <a href={share} target="_blank" rel="noopener noreferrer" className={`${btn.secondary} !py-2`}>
        Kirim link ke orang tua
      </a>
    </div>
  );
}

export default async function AkunPage({ searchParams }: PageProps<"/akun">) {
  const me = await requireMember();
  const sp = await searchParams;
  const db = await getDb();
  const settings = await getSettings();
  const [bookings, voas, points] = await Promise.all([
    db.select().from(schema.bookings).where(eq(schema.bookings.customerId, me.id)).orderBy(desc(schema.bookings.createdAt)),
    db.select().from(schema.voaOrders).where(eq(schema.voaOrders.customerId, me.id)).orderBy(desc(schema.voaOrders.createdAt)),
    pointBalance(me.id),
  ]);
  const bookingIds = bookings.map((b) => b.id);
  const voaIds = voas.map((v) => v.id);
  const fileCols = {
    kind: schema.files.kind,
    filename: schema.files.filename,
    shareToken: schema.files.shareToken,
    bookingId: schema.files.bookingId,
    voaId: schema.files.voaId,
  };
  const [bookingFiles, voaFiles] = await Promise.all([
    bookingIds.length ? db.select(fileCols).from(schema.files).where(inArray(schema.files.bookingId, bookingIds)) : [],
    voaIds.length ? db.select(fileCols).from(schema.files).where(inArray(schema.files.voaId, voaIds)) : [],
  ]);

  const activeBookings = bookings.filter((b) => !DONE_BOOKING.includes(b.status) && b.status !== "penawaran");
  const activeVoas = voas.filter((v) => !DONE_VOA.includes(v.status));
  const history = [
    ...bookings.filter((b) => DONE_BOOKING.includes(b.status)).map((b) => ({ key: `b${b.id}`, code: b.code, title: `${b.route} · ${b.airline ?? "-"}`, label: bookingStatusMeta[b.status].label })),
    ...voas.filter((v) => DONE_VOA.includes(v.status)).map((v) => ({ key: `v${v.id}`, code: v.code, title: `VOA · ${v.pax} orang`, label: voaStatusMeta[v.status].label })),
  ];

  // Pay links are created on first view of an unpaid order.
  const bookingPay = await Promise.all(
    activeBookings.map(async (b) => {
      const bal = await orderBalance({ bookingId: b.id }, settings);
      const unpaid = ["hold", "dibayar"].includes(b.status) && bal.due != null && bal.due > 0;
      return { bal, token: unpaid ? await ensurePayToken({ bookingId: b.id }) : null };
    }),
  );
  const voaPay = await Promise.all(
    activeVoas.map(async (v) => {
      const bal = await orderBalance({ voaId: v.id }, settings);
      const unpaid = ["dokumen", "dp", "otb_terbit"].includes(v.status) && bal.due != null && bal.due > 0;
      return { bal, token: unpaid ? await ensurePayToken({ voaId: v.id }) : null };
    }),
  );

  return (
    <>
      <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Halo, {me.name.split(/\s+/)[0]}</h1>
      <Link href="/akun/poin" className="mt-1 inline-block text-sm text-ink/60">
        Poin kamu: <span className="font-semibold text-brand-700">{points.toLocaleString("id-ID")}</span> →
      </Link>
      <div className="mt-4">
        <PublicFlash sp={sp} />
      </div>

      <SectionTitle>Tiket pesawat</SectionTitle>
      {activeBookings.length === 0 ? (
        <Empty>
          Belum ada tiket aktif.{" "}
          <Link href="/request" className="font-semibold text-brand-600 underline">
            Request tiket
          </Link>
        </Empty>
      ) : (
        <div className="space-y-3">
          {activeBookings.map((b, i) => {
            const { bal, token } = bookingPay[i];
            const tickets = bookingFiles.filter((f) => f.bookingId === b.id && f.kind === "tiket");
            return (
              <Card key={b.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {b.route.replace("-", " → ")} · {b.airline ?? "-"}
                    </p>
                    <p className="text-sm text-ink/60">
                      {b.code} · {fmtDepart(b)}
                    </p>
                  </div>
                  <Badge tone={bookingStatusMeta[b.status].tone}>{bookingStatusMeta[b.status].label}</Badge>
                </div>
                {b.pnr && <p className="mt-2 text-sm">Kode booking (PNR): <span className="font-mono font-semibold">{b.pnr}</span></p>}
                {b.status === "hold" && b.timeLimitAt && <p className="mt-1 text-sm font-medium text-amber-800">Bayar sebelum {fmtDateTime(b.timeLimitAt)}</p>}
                {bal.total != null && (
                  <p className="mt-1 text-sm text-ink/70">
                    Total {fmtMoney(bal.total, bal.currency)} · {bal.due === 0 ? "Lunas" : `sisa ${fmtMoney(bal.due, bal.currency)}`}
                  </p>
                )}
                <Files files={tickets} label="E-ticket" />
                {token && <PayLinks token={token} due={bal.due} currency={bal.currency} parentWa={me.waParent} />}
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>VOA Mesir Express</SectionTitle>
      {activeVoas.length === 0 ? (
        <Empty>Belum ada order VOA aktif.</Empty>
      ) : (
        <div className="space-y-3">
          {activeVoas.map((v, i) => {
            const { bal, token } = voaPay[i];
            const mine = voaFiles.filter((f) => f.voaId === v.id);
            const otb = mine.filter((f) => f.kind === "otb");
            const sent = mine.filter((f) => f.kind === "dokumen" || f.kind === "boarding");
            return (
              <Card key={v.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{v.code}</p>
                    <p className="text-sm text-ink/60">
                      {v.pax} orang{v.arrivalAt ? ` · tiba ${fmtDateTime(v.arrivalAt, TZ_CAIRO)} (Kairo)` : ""}
                    </p>
                  </div>
                  <Badge tone={voaStatusMeta[v.status].tone}>{voaStatusMeta[v.status].public}</Badge>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  <li>{v.docsPassport ? "✅" : "⬜"} Paspor diterima</li>
                  <li>{v.docsTicket ? "✅" : "⬜"} Tiket masuk & keluar Mesir diterima</li>
                </ul>
                {bal.total != null && (
                  <p className="mt-2 text-sm text-ink/70">
                    Total {fmtMoney(bal.total, "USD")} · {bal.due === 0 ? "Lunas" : `sisa ${fmtMoney(bal.due, "USD")}`}
                  </p>
                )}
                <Files files={otb} label="OK to Board" />
                <Files files={sent} label="File yang sudah kamu kirim" />
                {token && <PayLinks token={token} due={bal.due} currency="USD" parentWa={me.waParent} />}

                <details className="mt-3 rounded-xl bg-brand-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-700">Kirim dokumen / foto hari H</summary>
                  <form action={uploadVoaDocs.bind(null, v.id)} className="mt-3 space-y-2">
                    <select name="kind" defaultValue={["lunas", "dijemput"].includes(v.status) ? "boarding" : "dokumen"} className="w-full rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-gray-300">
                      <option value="dokumen">Paspor / tiket pesawat</option>
                      <option value="boarding">Foto hari H (boarding pass, rombongan, koper)</option>
                    </select>
                    <Input type="file" name="files" accept="application/pdf,image/*" multiple required />
                    <SubmitButton variant="secondary" className="w-full">
                      Kirim
                    </SubmitButton>
                    <p className="text-xs text-ink/55">Maksimal 5 file, masing-masing 10 MB.</p>
                  </form>
                </details>
                <Link href={`/lacak/${v.code}`} className="mt-3 inline-block text-sm font-semibold text-brand-600 underline">
                  Lihat status lengkap
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <>
          <SectionTitle>Riwayat</SectionTitle>
          <Card className="divide-y divide-gray-100 p-0">
            {history.map((h) => (
              <div key={h.key} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{h.title}</p>
                  <p className="text-xs text-ink/55">{h.code}</p>
                </div>
                <span className="text-xs text-ink/60">{h.label}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
