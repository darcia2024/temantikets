import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Card, Empty, SectionTitle } from "@/components/ui";
import { ensureReferralCode, requireMember } from "@/lib/member";
import { fmtMoney } from "@/lib/money";
import { pointBalance, pointHistory, pointKindLabel } from "@/lib/points";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/time";
import { appUrl } from "@/lib/wa";

export const metadata = { title: "Poin & ajak teman" };

export default async function PoinPage() {
  const me = await requireMember();
  const db = await getDb();
  const settings = await getSettings();
  const rules = settings.points;
  const [balance, history, code, friends] = await Promise.all([
    pointBalance(me.id),
    pointHistory(me.id),
    ensureReferralCode(me),
    db.select({ n: count() }).from(schema.customers).where(eq(schema.customers.referredById, me.id)),
  ]);
  const [paid] = await db
    .select({ n: count() })
    .from(schema.pointLedger)
    .where(and(eq(schema.pointLedger.customerId, me.id), eq(schema.pointLedger.kind, "referral")));
  const link = appUrl(`/request?ref=${code}`);
  const share = `https://wa.me/?text=${encodeURIComponent(
    `Pesan tiket Jakarta - Kairo & VOA Mesir Express di Temantiket. Pakai kode ajakan ${code} ya: ${link}`,
  )}`;

  return (
    <>
      <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none text-brand-700">Poin</h1>
      <Card className="mt-4 text-center">
        <p className="text-sm text-ink/60">Poin kamu</p>
        <p className="font-display text-6xl font-extrabold italic text-brand-700">{balance.toLocaleString("id-ID")}</p>
        <p className="text-sm text-ink/60">setara {fmtMoney(balance * rules.pointValueIdr, "IDR")} potongan</p>
        <p className="mt-2 text-xs text-ink/50">Tukarkan saat pesan berikutnya: bilang saja di WhatsApp mau pakai poin.</p>
      </Card>

      <SectionTitle>Ajak teman</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-ink/75">
          Teman yang pesan pakai kodemu: kamu dapat <span className="font-semibold">{rules.referralBonus} poin</span> (
          {fmtMoney(rules.referralBonus * rules.pointValueIdr, "IDR")}) setelah order pertamanya jadi.
        </p>
        <div className="rounded-xl bg-brand-50 p-3 text-center ring-1 ring-brand-100">
          <p className="text-xs text-ink/55">Kode ajakan kamu</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-brand-700">{code}</p>
        </div>
        <a href={share} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-[#1fa855] px-4 py-2.5 text-center text-sm font-semibold text-white">
          Bagikan lewat WhatsApp
        </a>
        <p className="text-xs text-ink/55">
          {friends[0].n} teman pakai kodemu · {paid.n} sudah order
        </p>
      </Card>

      <SectionTitle>Cara dapat poin</SectionTitle>
      <Card className="space-y-1 text-sm text-ink/75">
        <p>• Tiket pesawat: poin dihitung dari nilai pesanan, masuk saat tiket issued.</p>
        <p>• VOA Mesir Express: {rules.voaPerPax} poin per orang, masuk saat lunas.</p>
        <p>• Ajak teman: {rules.referralBonus} poin per teman.</p>
        <p>• 1 poin = {fmtMoney(rules.pointValueIdr, "IDR")}.</p>
      </Card>

      <SectionTitle>Riwayat poin</SectionTitle>
      {history.length === 0 ? (
        <Empty>Belum ada poin. Poin masuk otomatis setelah order selesai diproses.</Empty>
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{pointKindLabel[h.kind] ?? h.kind}</p>
                <p className="text-xs text-ink/55">
                  {h.note ?? ""} · {fmtDate(h.createdAt.toISOString().slice(0, 10))}
                </p>
              </div>
              <span className={`font-semibold ${h.points > 0 ? "text-emerald-700" : "text-red-700"}`}>
                {h.points > 0 ? "+" : ""}
                {h.points}
              </span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
