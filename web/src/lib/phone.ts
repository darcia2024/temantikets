/**
 * Normalise a WhatsApp number to international digits without "+".
 * Indonesian local numbers (08xx) become 628xx; Egyptian local (01x) become 201x.
 */
export function normalizeWa(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("08")) d = "62" + d.slice(1);
  else if (/^01[0125]\d{8}$/.test(d)) d = "20" + d.slice(1);
  d = d.replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) return null;
  return d;
}

export function displayWa(wa: string): string {
  return "+" + wa;
}
