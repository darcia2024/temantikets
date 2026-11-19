import { describe, expect, it } from "vitest";
import { parseContacts } from "./contacts";
import { parseAmount } from "./money";
import { normalizeWa } from "./phone";
import { cancelReasons, monthRange, salesByAirline, shiftMonth, type BookingRow } from "./reports";
import { DEFAULT_SETTINGS, voaTierFor } from "./settings";
import { BOOKING_STATUS, VOA_STATUS } from "@/db/schema";
import { bookingNext, voaNext } from "./status";
import { convert } from "./suppliers";
import { addBusinessDays, localToUtc, TZ_CAIRO, TZ_WIB, utcToLocalInput } from "./time";
import { passportWarning } from "./wa";

describe("normalizeWa", () => {
  it.each([
    ["0812-3456-7890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["0062 812 3456 7890", "6281234567890"],
    ["01001234567", "201001234567"], // Egyptian mobile, local format
    ["+20 100 123 4567", "201001234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeWa(input)).toBe(expected);
  });

  it("rejects junk", () => {
    expect(normalizeWa("")).toBeNull();
    expect(normalizeWa("123")).toBeNull();
    expect(normalizeWa(null)).toBeNull();
  });
});

describe("parseAmount", () => {
  it.each([
    ["10.500.000", 10500000],
    ["10,500,000", 10500000],
    ["Rp 1.250.000,50", 1250000.5],
    ["185.50", 185.5],
    ["185,5", 185.5],
    ["1,250,000.75", 1250000.75],
    ["36.000", 36000],
    ["185", 185],
    ["", null],
    ["abc", null],
  ])("%s → %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
});

describe("time zones", () => {
  it("reads datetime-local input as WIB (UTC+7)", () => {
    expect(localToUtc("2026-11-20T10:00", TZ_WIB)?.toISOString()).toBe("2026-11-20T03:00:00.000Z");
  });

  it("handles Cairo winter (UTC+2) and summer time (UTC+3)", () => {
    expect(localToUtc("2026-01-15T10:00", TZ_CAIRO)?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(localToUtc("2026-07-15T10:00", TZ_CAIRO)?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("round-trips back to the form value", () => {
    const d = localToUtc("2026-07-15T23:45", TZ_CAIRO);
    expect(utcToLocalInput(d, TZ_CAIRO)).toBe("2026-07-15T23:45");
  });

  it("rejects bad input", () => {
    expect(localToUtc("kemarin", TZ_WIB)).toBeNull();
    expect(localToUtc(null, TZ_WIB)).toBeNull();
  });

  it("adds business days over a weekend (OK to Board estimate)", () => {
    // Thu 19 Nov 2026 + 4 working days = Wed 25 Nov
    const out = addBusinessDays(new Date("2026-11-19T09:00:00Z"), 4);
    expect(out.toISOString().slice(0, 10)).toBe("2026-11-25");
  });
});

describe("VOA tariff tiers", () => {
  const tiers = DEFAULT_SETTINGS.voaTiers;
  it.each([
    [1, 270],
    [2, 185],
    [6, 185],
    [7, 175],
    [12, 175],
    [13, null],
  ])("%i orang → %s USD", (pax, rate) => {
    expect(voaTierFor(tiers, pax)?.rateUsd ?? null).toBe(rate);
  });
});

describe("status flows", () => {
  it("only point at real statuses", () => {
    for (const next of Object.values(bookingNext)) for (const s of next) expect(BOOKING_STATUS).toContain(s);
    for (const next of Object.values(voaNext)) for (const s of next) expect(VOA_STATUS).toContain(s);
  });

  it("final states have no way forward", () => {
    expect(bookingNext.selesai).toEqual([]);
    expect(bookingNext.batal).toEqual([]);
    expect(voaNext.selesai).toEqual([]);
    expect(voaNext.batal).toEqual([]);
  });

  it("an issued ticket cannot be cancelled directly (must go through refund)", () => {
    expect(bookingNext.issued).not.toContain("batal");
  });
});

describe("passport warning", () => {
  it("flags passports expiring within 6 months of travel", () => {
    expect(passportWarning("2027-01-01", new Date("2026-12-01T00:00:00Z"))).toMatch(/kurang dari 6 bulan/);
    expect(passportWarning("2028-01-01", new Date("2026-12-01T00:00:00Z"))).toBeNull();
    expect(passportWarning(null, null)).toBeNull();
  });
});

describe("currency conversion", () => {
  const rates = { USD: 16500, EGP: 330 };
  it("converts through Rupiah", () => {
    expect(convert(100, "USD", "IDR", rates)).toBe(1650000);
    expect(convert(1650000, "IDR", "USD", rates)).toBe(100);
    expect(convert(100, "USD", "EGP", rates)).toBe(5000);
    expect(convert(42, "EGP", "EGP", rates)).toBe(42);
  });
});

describe("contacts import", () => {
  it("parses a vCard export, including folded lines and duplicates", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Ahmad Fauzi",
      "TEL;TYPE=CELL:0812-0000-0001",
      "END:VCARD",
      "BEGIN:VCARD",
      "FN:Siti",
      "item1.TEL:+20 100 000 0002",
      "END:VCARD",
      "BEGIN:VCARD",
      "FN:Ahmad (duplikat)",
      "TEL:+6281200000001",
      "END:VCARD",
    ].join("\r\n");
    expect(parseContacts(vcf)).toEqual([
      { name: "Ahmad Fauzi", wa: "6281200000001" },
      { name: "Siti", wa: "201000000002" },
    ]);
  });

  it("parses quoted-printable names", () => {
    const vcf = "BEGIN:VCARD\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=81isyah\nTEL:081200000003\nEND:VCARD";
    expect(parseContacts(vcf)).toEqual([{ name: "Áisyah", wa: "6281200000003" }]);
  });

  it("parses CSV / pasted lines in either column order", () => {
    const csv = "Nama,Nomor\nAhmad, 081200000001\n+20 100 000 0002; Siti\nbaris rusak";
    expect(parseContacts(csv)).toEqual([
      { name: "Ahmad", wa: "6281200000001" },
      { name: "Siti", wa: "201000000002" },
    ]);
  });
});

describe("reports", () => {
  const rates = { USD: 16500, EGP: 330 };
  const row = (o: Partial<BookingRow>): BookingRow => ({
    airline: "Saudia",
    status: "issued",
    currency: "IDR",
    sellPrice: 10_000_000,
    costPrice: 9_000_000,
    cancelReason: null,
    requestId: null,
    ...o,
  });

  it("sums revenue and margin per airline, skipping unsold bookings", () => {
    const out = salesByAirline(
      [
        row({}),
        row({ sellPrice: 12_000_000, costPrice: 11_000_000 }),
        row({ airline: "Emirates", currency: "USD", sellPrice: 700, costPrice: 650 }),
        row({ status: "penawaran" }),
        row({ status: "batal" }),
        row({ airline: "Emirates", costPrice: null }),
      ],
      rates,
    );
    expect(out).toEqual([
      { airline: "Saudia", tickets: 2, revenueIdr: 22_000_000, marginIdr: 2_000_000, missingCost: 0 },
      { airline: "Emirates", tickets: 2, revenueIdr: 700 * 16500 + 10_000_000, marginIdr: 50 * 16500, missingCost: 1 },
    ]);
  });

  it("groups cancel reasons case-insensitively", () => {
    const out = cancelReasons([
      row({ status: "batal", cancelReason: "Harga kemahalan" }),
      row({ status: "batal", cancelReason: "harga kemahalan " }),
      row({ status: "batal", cancelReason: null }),
    ]);
    expect(out).toEqual([
      { reason: "Harga kemahalan", count: 2 },
      { reason: "Tanpa alasan", count: 1 },
    ]);
  });

  it("uses WIB month boundaries", () => {
    const { start, end } = monthRange("2026-11");
    expect(start.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
