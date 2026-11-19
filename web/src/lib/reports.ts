import type { Currency } from "@/db/schema";
import type { Settings } from "./settings";
import { convert } from "./suppliers";

export type BookingRow = {
  airline: string | null;
  status: string;
  currency: Currency;
  sellPrice: number | null;
  costPrice: number | null;
  cancelReason: string | null;
  requestId: number | null;
};

export const SOLD = ["dibayar", "issued", "berangkat", "selesai", "perubahan"];

export type AirlineLine = { airline: string; tickets: number; revenueIdr: number; marginIdr: number; missingCost: number };

/** Revenue and margin per airline, in Rupiah, for sold bookings. */
export function salesByAirline(rows: BookingRow[], rates: Settings["rates"]): AirlineLine[] {
  const map = new Map<string, AirlineLine>();
  for (const r of rows) {
    if (!SOLD.includes(r.status)) continue;
    const key = r.airline?.trim() || "Tanpa maskapai";
    const line = map.get(key) ?? { airline: key, tickets: 0, revenueIdr: 0, marginIdr: 0, missingCost: 0 };
    line.tickets++;
    const sell = r.sellPrice != null ? convert(r.sellPrice, r.currency, "IDR", rates) : 0;
    line.revenueIdr += sell;
    if (r.costPrice != null && r.sellPrice != null) line.marginIdr += sell - convert(r.costPrice, r.currency, "IDR", rates);
    else line.missingCost++;
    map.set(key, line);
  }
  return [...map.values()].sort((a, b) => b.revenueIdr - a.revenueIdr);
}

/** Group cancel reasons loosely (lowercase, first 40 chars) so typos don't split them. */
export function cancelReasons(rows: BookingRow[]): { reason: string; count: number }[] {
  const map = new Map<string, { reason: string; count: number }>();
  for (const r of rows) {
    if (r.status !== "batal") continue;
    const reason = (r.cancelReason ?? "Tanpa alasan").trim();
    const key = reason.toLowerCase().slice(0, 40);
    const e = map.get(key) ?? { reason, count: 0 };
    e.count++;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function monthRange(ym: string | undefined, now = new Date()): { start: Date; end: Date; ym: string } {
  const m = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, mo] = m.split("-").map(Number);
  // Month boundaries in WIB (UTC+7), where the owner works.
  const start = new Date(Date.UTC(y, mo - 1, 1, -7));
  const end = new Date(Date.UTC(y, mo, 1, -7));
  return { start, end, ym: m };
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
