import { notFound } from "next/navigation";
import { UserError } from "./action";

export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function reqStr(fd: FormData, key: string, label = key): string {
  const v = str(fd, key);
  if (!v) throw new UserError(`${label} wajib diisi.`);
  return v;
}

export function int(fd: FormData, key: string, fallback: number): number {
  const n = Number(str(fd, key));
  return Number.isInteger(n) ? n : fallback;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function idParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) notFound();
  return n;
}
