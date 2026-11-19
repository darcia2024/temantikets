import { randomBytes } from "node:crypto";

// No 0/O/1/I to avoid mistakes when customers type a code from WhatsApp.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomChars(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function yymm(now = new Date()): string {
  const y = String(now.getUTCFullYear()).slice(2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return y + m;
}

export const newBookingCode = () => `TT-${yymm()}-${randomChars(4)}`;
export const newVoaCode = () => `VOA-${yymm()}-${randomChars(4)}`;
export const newRequestCode = () => `RQ-${yymm()}-${randomChars(4)}`;
export const newToken = () => randomBytes(18).toString("base64url");
