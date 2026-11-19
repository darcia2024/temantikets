import type { Currency } from "@/db/schema";

export function fmtMoney(amount: number | null | undefined, currency: Currency | string): string {
  if (amount == null) return "-";
  const fractionDigits = currency === "IDR" ? 0 : 2;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** Parse "1.250.000" / "1,250,000" / "185.50" style input into a number. */
export function parseAmount(input: FormDataEntryValue | null): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Both present: the last one is the decimal separator ("1.250.000,50" / "1,250,000.50").
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    s = s.split(thousands).join("").replace(dec, ".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = s.split(sep);
    // Repeated separator, or exactly 3 digits after it → thousands ("10.500.000", "1,250").
    const thousands = parts.length > 2 || parts.at(-1)!.length === 3;
    s = thousands ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
