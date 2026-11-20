import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { appUrl } from "./wa";

export const MEMBER_COOKIE = "tt_member";
const SESSION_DAYS = 90;
const LINK_DAYS = 7;

type Customer = typeof schema.customers.$inferSelect;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET harus diisi (minimal 32 karakter)");
  return new TextEncoder().encode(s);
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{30,60}$/.test(t);

/** New one-time login link for a customer, valid for 7 days. */
export async function createLoginLink(customerId: number): Promise<string> {
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  await db.insert(schema.memberLogins).values({
    customerId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + LINK_DAYS * 86400000),
  });
  return appUrl(`/masuk/${token}`);
}

/** Looks a link up without using it (WhatsApp previews open links too). */
export async function peekLoginToken(token: string): Promise<Customer | null> {
  if (!isTokenShape(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ c: schema.customers })
    .from(schema.memberLogins)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.memberLogins.customerId))
    .where(
      and(eq(schema.memberLogins.tokenHash, hashToken(token)), isNull(schema.memberLogins.usedAt), gt(schema.memberLogins.expiresAt, new Date())),
    );
  return row?.c ?? null;
}

/** Uses the link once and signs the customer in. Returns false if it is used up or expired. */
export async function consumeLoginToken(token: string): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const db = await getDb();
  const [used] = await db
    .update(schema.memberLogins)
    .set({ usedAt: new Date() })
    .where(
      and(eq(schema.memberLogins.tokenHash, hashToken(token)), isNull(schema.memberLogins.usedAt), gt(schema.memberLogins.expiresAt, new Date())),
    )
    .returning({ customerId: schema.memberLogins.customerId });
  if (!used) return false;
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, used.customerId) });
  if (!c) return false;
  const jwt = await new SignJWT({ role: "member", cid: c.id, v: c.loginVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  (await cookies()).set(MEMBER_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return true;
}

export async function getMember(): Promise<Customer | null> {
  const token = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "member" || typeof payload.cid !== "number") return null;
    const db = await getDb();
    const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, payload.cid) });
    // A bumped loginVersion signs out every device.
    if (!c || c.loginVersion !== payload.v) return null;
    return c;
  } catch {
    return null;
  }
}

/** Call at the top of every member page and member Server Action. */
export async function requireMember(): Promise<Customer> {
  const c = await getMember();
  if (!c) redirect("/akun/masuk");
  return c;
}

export async function logoutMember(): Promise<void> {
  (await cookies()).delete(MEMBER_COOKIE);
}

export async function revokeMemberSessions(customerId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.customers)
    .set({ loginVersion: sql`${schema.customers.loginVersion} + 1` })
    .where(eq(schema.customers.id, customerId));
  await db.update(schema.memberLogins).set({ usedAt: new Date() }).where(and(eq(schema.memberLogins.customerId, customerId), isNull(schema.memberLogins.usedAt)));
}

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** The customer's referral code, created on first use (e.g. "AHMAD7K2"). */
export async function ensureReferralCode(c: Customer): Promise<string> {
  if (c.referralCode) return c.referralCode;
  const db = await getDb();
  const base = c.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "TEMAN";
  for (let i = 0; i < 5; i++) {
    const bytes = randomBytes(3);
    const code = base + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
    const [row] = await db
      .update(schema.customers)
      .set({ referralCode: code })
      .where(and(eq(schema.customers.id, c.id), isNull(schema.customers.referralCode)))
      .returning({ code: schema.customers.referralCode })
      .catch(() => [] as { code: string | null }[]); // unique clash: try another
    if (row?.code) return row.code;
    const fresh = await db.query.customers.findFirst({ where: eq(schema.customers.id, c.id) });
    if (fresh?.referralCode) return fresh.referralCode;
  }
  throw new Error("Gagal membuat kode referral");
}

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}
