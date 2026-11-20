import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

// In-memory database for the app's own getDb() (migrations run on first use).
process.env.PGLITE_DIR = "memory://";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";

// Server Actions/cookies need a request; give the member helpers a simple cookie jar.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

const { getDb, schema } = await import("@/db");
const { DEFAULT_SETTINGS } = await import("@/lib/settings");
const { awardBookingPoints, awardVoaPoints, bookingPoints, pointBalance, reverseBookingPoints } = await import("@/lib/points");
const { insertPayment, orderBalance, ensurePayToken } = await import("@/lib/payments");
const { submitProof, PublicError } = await import("@/lib/proofs");
const member = await import("@/lib/member");

const settings = structuredClone(DEFAULT_SETTINGS);
let friendId: number;
let newbieId: number;

beforeAll(async () => {
  const db = await getDb();
  const [friend] = await db.insert(schema.customers).values({ name: "Ahmad Fauzi", wa: "6281200001001" }).returning();
  const [newbie] = await db.insert(schema.customers).values({ name: "Budi", wa: "6281200001002", referredById: friend.id }).returning();
  friendId = friend.id;
  newbieId = newbie.id;
});

async function booking(over: Partial<typeof schema.bookings.$inferInsert> = {}) {
  const db = await getDb();
  const [b] = await db
    .insert(schema.bookings)
    .values({ code: `TT-2611-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, customerId: newbieId, route: "CGK-CAI", ...over })
    .returning();
  return b;
}

describe("points", () => {
  it("earn 1 point per Rp10.000 margin, converting other currencies", () => {
    expect(bookingPoints({ sellPrice: 12_500_000, costPrice: 12_000_000, currency: "IDR" }, settings.points, settings.rates)).toBe(50);
    // $40 margin × 16.500 = Rp660.000 → 66 points
    expect(bookingPoints({ sellPrice: 840, costPrice: 800, currency: "USD" }, settings.points, settings.rates)).toBe(66);
    expect(bookingPoints({ sellPrice: 100, costPrice: 120, currency: "IDR" }, settings.points, settings.rates)).toBe(0);
    expect(bookingPoints({ sellPrice: 100, costPrice: null, currency: "IDR" }, settings.points, settings.rates)).toBe(0);
  });

  it("award ticket points once, pay the referrer once, and reverse on refund", async () => {
    const db = await getDb();
    const b = await booking({ sellPrice: 12_500_000, costPrice: 12_000_000, status: "issued" });
    await db.transaction((tx) => awardBookingPoints(tx, b, settings));
    await db.transaction((tx) => awardBookingPoints(tx, b, settings)); // double tap
    expect(await pointBalance(newbieId)).toBe(50);
    expect(await pointBalance(friendId)).toBe(100);

    // Second order: own points again, but no second referral bonus.
    const b2 = await booking({ sellPrice: 13_000_000, costPrice: 12_000_000 });
    await db.transaction((tx) => awardBookingPoints(tx, b2, settings));
    expect(await pointBalance(newbieId)).toBe(150);
    expect(await pointBalance(friendId)).toBe(100);

    await db.transaction((tx) => reverseBookingPoints(tx, b2));
    await db.transaction((tx) => reverseBookingPoints(tx, b2));
    expect(await pointBalance(newbieId)).toBe(50);
  });

  it("award VOA points per person when paid off via a pelunasan payment", async () => {
    const db = await getDb();
    const [v] = await db
      .insert(schema.voaOrders)
      .values({ code: "VOA-2611-PNT1", customerId: newbieId, pax: 3, totalUsd: 555, status: "otb_terbit" })
      .returning();
    const res = await db.transaction((tx) =>
      insertPayment(tx, { voaId: v.id }, { kind: "pelunasan", method: "transfer", currency: "USD", amount: 277.5 }, settings),
    );
    expect(res.moved).toContain("Lunas");
    expect(await pointBalance(newbieId)).toBe(50 + 60);
    await db.transaction((tx) => awardVoaPoints(tx, { ...v, status: "lunas" }, settings));
    expect(await pointBalance(newbieId)).toBe(110);
  });
});

describe("pay link and transfer proofs", () => {
  it("compute the balance across currencies", async () => {
    const db = await getDb();
    const b = await booking({ sellPrice: 10_000_000, status: "hold" });
    await db.insert(schema.payments).values({ bookingId: b.id, kind: "dp", method: "tunai", currency: "EGP", amount: 10_000, receiptToken: "tok-egp-1" });
    const bal = await orderBalance({ bookingId: b.id }, settings);
    expect(bal).toMatchObject({ currency: "IDR", total: 10_000_000, paid: 3_300_000, due: 6_700_000 });
  });

  it("keep one pay token per order", async () => {
    const b = await booking();
    const [t1, t2] = await Promise.all([ensurePayToken({ bookingId: b.id }), ensurePayToken({ bookingId: b.id })]);
    expect(t1).toBe(t2);
    expect(await ensurePayToken({ bookingId: b.id })).toBe(t1);
  });

  it("store a proof, reject bad input with fixed message keys, and cap pending proofs", async () => {
    const b = await booking({ sellPrice: 5_000_000, status: "hold" });
    const order = { id: b.id, code: b.code, status: b.status, kind: "booking" as const };
    const form = (amount: string, file?: File) => {
      const fd = new FormData();
      fd.set("amount", amount);
      fd.set("currency", "IDR");
      fd.set("payerName", "Ayah Budi");
      if (file) fd.set("bukti", file);
      return fd;
    };
    const jpg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "bukti.jpg", { type: "image/jpeg" });

    await expect(submitProof(order, form("", jpg()), "link", "link")).rejects.toMatchObject({ key: "nominal" });
    await expect(submitProof(order, form("5.000.000"), "link", "link")).rejects.toMatchObject({ key: "bukti" });
    const exe = new File(["MZ"], "x.exe", { type: "application/x-msdownload" });
    await expect(submitProof(order, form("5.000.000", exe), "link", "link")).rejects.toBeInstanceOf(PublicError);

    for (let i = 0; i < 3; i++) await submitProof(order, form("5.000.000", jpg()), "link", "link");
    await expect(submitProof(order, form("5.000.000", jpg()), "link", "link")).rejects.toMatchObject({ key: "antre" });

    const db = await getDb();
    const rows = await db.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.bookingId, b.id));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ amount: 5_000_000, status: "menunggu", source: "link", payerName: "Ayah Budi" });
    await expect(submitProof({ ...order, status: "batal" }, form("1", jpg()), "link", "link")).rejects.toMatchObject({ key: "batal" });
  });
});

describe("member login", () => {
  it("links work once, expire, and can be revoked", async () => {
    const url = await member.createLoginLink(newbieId);
    const token = url.split("/masuk/")[1];
    // Peeking (e.g. WhatsApp link preview) does not use the link.
    expect((await member.peekLoginToken(token))?.id).toBe(newbieId);
    expect((await member.peekLoginToken(token))?.id).toBe(newbieId);

    expect(await member.consumeLoginToken(token)).toBe(true);
    expect((await member.getMember())?.id).toBe(newbieId);
    expect(await member.consumeLoginToken(token)).toBe(false);
    expect(await member.peekLoginToken(token)).toBeNull();

    // Only the hash is stored.
    const db = await getDb();
    const rows = await db.select().from(schema.memberLogins).where(eq(schema.memberLogins.customerId, newbieId));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);

    await member.revokeMemberSessions(newbieId);
    expect(await member.getMember()).toBeNull();

    await db.update(schema.memberLogins).set({ expiresAt: new Date(Date.now() - 1000) });
    const expired = (await member.createLoginLink(newbieId)).split("/masuk/")[1];
    await db.update(schema.memberLogins).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await member.consumeLoginToken(expired)).toBe(false);
  });

  it("give every customer a unique referral code", async () => {
    const db = await getDb();
    const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, friendId) });
    const code = await member.ensureReferralCode(c!);
    expect(code).toMatch(/^AHMAD[A-Z2-9]{3}$/);
    expect(await member.ensureReferralCode({ ...c!, referralCode: null })).toBe(code);
    expect(member.normalizeReferralCode(" ahmad7k2 ")).toBe("AHMAD7K2");
    expect(member.normalizeReferralCode("<script>")).toBeNull();
  });
});
