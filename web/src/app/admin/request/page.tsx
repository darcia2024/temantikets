import { desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, PageHeader, WaButton } from "@/components/ui";
import { displayWa } from "@/lib/phone";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { waLink } from "@/lib/wa";
import { closeRequest, processRequest } from "./actions";

export const metadata = { title: "Request tiket" };

const priorityLabel: Record<string, string> = {
  termurah: "Harga termurah",
  bagasi: "Bagasi terbesar",
  tercepat: "Transit tersingkat",
  maskapai: "Maskapai tertentu",
};

export default async function RequestsPage({ searchParams }: PageProps<"/admin/request">) {
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.ticketRequests)
    .where(inArray(schema.ticketRequests.status, ["baru", "diproses"]))
    .orderBy(desc(schema.ticketRequests.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader title="Request tiket" back="/admin/lainnya" />
      <Flash sp={sp} />
      {rows.length === 0 ? (
        <Empty>Belum ada request dari form website.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-gray-500">{displayWa(r.wa)}</p>
                </div>
                <Badge tone={r.status === "baru" ? "amber" : "blue"}>{r.status}</Badge>
              </div>
              <p className="mt-2 text-sm">
                {r.route} · {fmtDate(r.departDate)}
                {r.flexDays ? ` (±${r.flexDays} hari)` : ""}
                {r.returnDate ? ` · pulang ${fmtDate(r.returnDate)}` : ""} · {r.pax} orang
              </p>
              <p className="text-sm text-gray-600">
                {priorityLabel[r.priority] ?? r.priority}
                {r.wantsVoa && " · mau VOA Mesir Express"}
              </p>
              {r.notes && <p className="mt-1 text-sm italic text-gray-600">{r.notes}</p>}
              <p className="mt-1 text-xs text-gray-400">
                {r.code} · masuk {fmtDateTime(r.createdAt)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <WaButton href={waLink(r.wa, `Assalamualaikum ${r.name}, terima kasih sudah request tiket ${r.route} (${r.code}). Kami cek harga dulu ya.`)}>
                  Balas
                </WaButton>
                <form action={processRequest.bind(null, r.id)}>
                  <SubmitButton>Buat booking</SubmitButton>
                </form>
                <form action={closeRequest.bind(null, r.id)}>
                  <SubmitButton variant="danger" name="status" value="batal" confirm="Tutup request ini?">
                    Tutup
                  </SubmitButton>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
