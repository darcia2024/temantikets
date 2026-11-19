import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { MandubStatus } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Input } from "@/components/ui";
import { isMandubToken } from "@/lib/auth";
import { displayWa } from "@/lib/phone";
import { mandubStatusMeta, voaStatusMeta } from "@/lib/status";
import { TZ_CAIRO } from "@/lib/time";
import { setMandubStatus } from "./actions";

export const metadata = { title: "Papan Mandub", robots: { index: false, follow: false } };

const dayFmt = new Intl.DateTimeFormat("id-ID", { timeZone: TZ_CAIRO, weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { timeZone: TZ_CAIRO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const nextStep: Record<MandubStatus, MandubStatus | null> = {
  belum: "menunggu_gate",
  menunggu_gate: "voa_beres",
  voa_beres: "keluar",
  keluar: null,
};

export default async function MandubBoard({ params, searchParams }: PageProps<"/mandub/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  if (!isMandubToken(token)) notFound();
  const db = await getDb();
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 3600000);
  const to = new Date(now.getTime() + 14 * 86400000);
  const orders = await db
    .select({ v: schema.voaOrders, customerName: schema.customers.name, wa: schema.customers.wa })
    .from(schema.voaOrders)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.voaOrders.customerId))
    .where(
      and(
        inArray(schema.voaOrders.status, ["dp", "otb_terbit", "lunas", "dijemput", "selesai"]),
        gte(schema.voaOrders.arrivalAt, from),
        lte(schema.voaOrders.arrivalAt, to),
      ),
    )
    .orderBy(asc(schema.voaOrders.arrivalAt));

  const ids = orders.map((o) => o.v.id);
  const [pax, photos] = ids.length
    ? await Promise.all([
        db
          .select({ voaId: schema.voaPassengers.voaId, name: schema.passengers.fullName })
          .from(schema.voaPassengers)
          .innerJoin(schema.passengers, eq(schema.passengers.id, schema.voaPassengers.passengerId))
          .where(inArray(schema.voaPassengers.voaId, ids)),
        db
          .select({ voaId: schema.files.voaId, filename: schema.files.filename, shareToken: schema.files.shareToken })
          .from(schema.files)
          .where(and(inArray(schema.files.voaId, ids), eq(schema.files.kind, "boarding"))),
      ])
    : [[], []];

  const byDay = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = dayFmt.format(o.v.arrivalAt!);
    byDay.set(key, [...(byDay.get(key) ?? []), o]);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Logo size={28} tagline={false} />
      <h1 className="mt-4 font-display text-3xl font-extrabold uppercase italic leading-none text-brand-700">Papan Kedatangan Mandub</h1>
      <p className="mb-4 text-sm text-gray-500">Bandara Kairo · semua jam dalam waktu Kairo · 14 hari ke depan</p>
      <Flash sp={sp} />
      {orders.length === 0 && <Empty>Belum ada kedatangan terjadwal.</Empty>}
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{day}</h2>
          <div className="space-y-3">
            {list.map(({ v, customerName, wa }) => {
              const names = pax.filter((p) => p.voaId === v.id).map((p) => p.name);
              const pics = photos.filter((p) => p.voaId === v.id);
              const next = nextStep[v.mandubStatus];
              const ready = v.status === "lunas" || v.status === "dijemput" || v.status === "selesai";
              return (
                <Card key={v.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{timeFmt.format(v.arrivalAt!)}</p>
                      <p className="font-semibold">
                        {v.flightNo ?? "-"} · {v.airline ?? "-"} · {v.terminal ?? "Terminal ?"}
                      </p>
                    </div>
                    <Badge tone={mandubStatusMeta[v.mandubStatus].tone}>{mandubStatusMeta[v.mandubStatus].label}</Badge>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="font-medium">{customerName}</span> · {v.pax} orang · {v.code}
                  </p>
                  {names.length > 0 && <p className="text-sm text-gray-600">{names.join(", ")}</p>}
                  <p className="text-sm text-gray-500">Kontak: {displayWa(wa)}</p>
                  {!ready && (
                    <p className="mt-2 text-xs font-medium text-amber-800">Status order: {voaStatusMeta[v.status].label} (belum lunas)</p>
                  )}
                  {pics.length > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-2 text-sm">
                      {pics.map((p) => (
                        <a key={p.shareToken} href={`/f/${p.shareToken}`} target="_blank" className="text-brand-600 underline">
                          {p.filename}
                        </a>
                      ))}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">Foto boarding pass / rombongan / koper belum ada.</p>
                  )}
                  {v.mandubNote && <p className="mt-2 text-sm italic text-gray-600">{v.mandubNote}</p>}
                  {next && (
                    <form action={setMandubStatus.bind(null, token, v.id)} className="mt-3 flex gap-2">
                      <Input name="note" placeholder="Catatan (opsional)" />
                      <SubmitButton name="to" value={next}>
                        {mandubStatusMeta[next].label}
                      </SubmitButton>
                    </form>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
