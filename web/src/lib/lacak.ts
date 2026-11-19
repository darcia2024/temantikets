import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mandubStatusMeta, VOA_PUBLIC_STEPS, voaStatusMeta } from "./status";

export type LacakResult = {
  code: string;
  status: string;
  statusLabel: string;
  cancelled: boolean;
  steps: { key: string; label: string; done: boolean; current: boolean }[];
  arrivalAt: string | null;
  flightNo: string | null;
  mandub: string;
  updatedAt: string;
};

/** Public order status. Deliberately contains no names, phone numbers or passport data. */
export async function lacakOrder(rawCode: string): Promise<LacakResult | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^VOA-\d{4}-[A-Z0-9]{4}$/.test(code)) return null;
  const db = await getDb();
  const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.code, code) });
  if (!v) return null;
  const idx = VOA_PUBLIC_STEPS.indexOf(v.status);
  return {
    code: v.code,
    status: v.status,
    statusLabel: voaStatusMeta[v.status].public,
    cancelled: v.status === "batal",
    steps: VOA_PUBLIC_STEPS.map((s, i) => ({
      key: s,
      label: voaStatusMeta[s].public,
      done: idx >= 0 && i < idx,
      current: i === idx,
    })),
    arrivalAt: v.arrivalAt?.toISOString() ?? null,
    flightNo: v.flightNo,
    mandub: mandubStatusMeta[v.mandubStatus].label,
    updatedAt: v.updatedAt.toISOString(),
  };
}
