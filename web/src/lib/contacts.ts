import { normalizeWa } from "./phone";

export type ParsedContact = { name: string; wa: string };

function unfoldVcf(text: string): string[] {
  // vCard lines may be folded (continuation lines start with a space or tab).
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function decodeQP(value: string): string {
  try {
    const bytes = value.replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return decodeURIComponent(escape(bytes));
  } catch {
    return value;
  }
}

/** Parse a .vcf export (Android/iPhone contacts) or a CSV with "name,phone" columns. */
export function parseContacts(text: string): ParsedContact[] {
  const out = new Map<string, ParsedContact>();
  if (/BEGIN:VCARD/i.test(text)) {
    let name = "";
    let phones: string[] = [];
    for (const line of unfoldVcf(text)) {
      const [rawKey, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      const key = rawKey.toUpperCase();
      if (key === "BEGIN") {
        name = "";
        phones = [];
      } else if (key.startsWith("FN")) {
        name = key.includes("QUOTED-PRINTABLE") ? decodeQP(value) : value;
      } else if (key.startsWith("TEL") || key.includes(".TEL")) {
        phones.push(value);
      } else if (key === "END") {
        for (const p of phones) {
          const wa = normalizeWa(p);
          if (wa && name && !out.has(wa)) out.set(wa, { name, wa });
        }
      }
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const cols = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 2) continue;
      const phoneIdx = cols.findIndex((c) => normalizeWa(c));
      if (phoneIdx < 0) continue;
      const wa = normalizeWa(cols[phoneIdx])!;
      const name = cols.find((c, i) => i !== phoneIdx && c && !/^\+?\d[\d\s-]*$/.test(c)) ?? "";
      if (name && !out.has(wa)) out.set(wa, { name, wa });
    }
  }
  return [...out.values()];
}
