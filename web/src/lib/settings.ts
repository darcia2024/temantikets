import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type VoaTier = { label: string; minPax: number; maxPax: number | null; rateUsd: number | null };

export type Settings = {
  /** Rupiah per 1 unit of currency */
  rates: { USD: number; EGP: number };
  voaTiers: VoaTier[];
  /** People who may hold EGP cash on behalf of Temantiket */
  cashHolders: string[];
  /** Shown on pay links and in the member area. Free text, one account per line. */
  bankAccounts: string;
  points: PointRules;
};

export type PointRules = {
  /** 1 point for every this many Rupiah of ticket margin */
  idrPerPoint: number;
  /** Points per person on a paid-off VOA order */
  voaPerPax: number;
  /** Points for the referrer when a friend's first order is issued */
  referralBonus: number;
  /** What 1 point is worth when redeemed, in Rupiah */
  pointValueIdr: number;
};

// Tariffs from voatemantiket.site (Nov 2026). Grup 12+ is negotiated.
export const DEFAULT_SETTINGS: Settings = {
  rates: { USD: 16500, EGP: 330 },
  voaTiers: [
    { label: "Sendiri", minPax: 1, maxPax: 1, rateUsd: 270 },
    { label: "Keluarga", minPax: 2, maxPax: 6, rateUsd: 185 },
    { label: "Rombongan", minPax: 7, maxPax: 12, rateUsd: 175 },
    { label: "Grup besar", minPax: 13, maxPax: null, rateUsd: null },
  ],
  cashHolders: ["owner"],
  bankAccounts: "",
  // Defaults: Rp500.000 margin = 50 points = Rp5.000; a referral = Rp10.000.
  points: { idrPerPoint: 10000, voaPerPax: 20, referralBonus: 100, pointValueIdr: 100 },
};

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "app") });
  const saved = (row?.value as Partial<Settings>) ?? {};
  return { ...DEFAULT_SETTINGS, ...saved, points: { ...DEFAULT_SETTINGS.points, ...saved.points } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const db = await getDb();
  const value = { ...(await getSettings()), ...patch };
  await db
    .insert(schema.settings)
    .values({ key: "app", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

export function voaTierFor(tiers: VoaTier[], pax: number): VoaTier | undefined {
  return tiers.find((t) => pax >= t.minPax && (t.maxPax == null || pax <= t.maxPax));
}
