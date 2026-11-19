import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Audit log" };

const entityLabel: Record<string, string> = {
  booking: "Booking",
  booking_change: "Perubahan",
  voa: "VOA",
  customer: "Customer",
  passenger: "Penumpang",
  payment: "Pembayaran",
  supplier: "Supplier",
  supplier_ledger: "Deposit",
  request: "Request",
  settings: "Pengaturan",
  file: "File",
};

const hrefFor = (entity: string, id: number | null) =>
  id == null
    ? null
    : entity === "booking"
      ? `/admin/tiket/${id}`
      : entity === "voa"
        ? `/admin/voa/${id}`
        : entity === "customer"
          ? `/admin/customer/${id}`
          : entity === "supplier"
            ? `/admin/supplier/${id}`
            : null;

const HIDDEN = new Set(["updatedAt", "createdAt", "id", "receiptToken", "shareToken"]);

/** Field-level diff for display: only keys whose value changed. */
function diff(before: unknown, after: unknown): { key: string; from: unknown; to: unknown }[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  // Updates often log only the changed fields in `after`; compare just those.
  const keys = before && after ? Object.keys(a) : [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  return keys.filter((k) => !HIDDEN.has(k) && !same(b[k], a[k])).map((k) => ({ key: k, from: b[k], to: a[k] }));
}

const show = (v: unknown) => (v == null || v === "" ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" && entityLabel[sp.entity] ? sp.entity : null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(entity ? eq(schema.auditLog.entity, entity) : undefined)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader title="Audit log" back="/admin/lainnya" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/audit" className={`rounded-full px-3 py-1 text-xs font-medium ${!entity ? "bg-ink text-white" : "bg-white ring-1 ring-gray-200"}`}>
          Semua
        </Link>
        {Object.entries(entityLabel).map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/audit?entity=${k}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${entity === k ? "bg-ink text-white" : "bg-white ring-1 ring-gray-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>Belum ada catatan.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const changes = diff(r.before, r.after).slice(0, 8);
            const href = hrefFor(r.entity, r.entityId);
            return (
              <Card key={r.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    {entityLabel[r.entity] ?? r.entity}{" "}
                    {href ? (
                      <Link href={href} className="text-brand-700 underline">
                        #{r.entityId}
                      </Link>
                    ) : r.entityId != null ? (
                      `#${r.entityId}`
                    ) : null}{" "}
                    · {r.action}
                  </p>
                  <Badge tone={r.actor === "owner" ? "blue" : "violet"}>{r.actor}</Badge>
                </div>
                <p className="text-xs text-gray-500">{fmtDateTime(r.createdAt)}</p>
                {changes.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {changes.map((c) => (
                      <li key={c.key} className="break-all">
                        <span className="font-mono text-gray-500">{c.key}</span>: <span className="text-red-700 line-through">{show(c.from)}</span>{" "}
                        → <span className="text-emerald-700">{show(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
