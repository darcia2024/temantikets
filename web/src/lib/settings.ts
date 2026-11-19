import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type VoaTier = { label: string; minPax: number; maxPax: number | null; rateUsd: number | null };

export type Settings = {
  /** Rupiah per 1 unit of currency */
  rates: { USD: number; EGP: number };
  voaTiers: VoaTier[];
  /** People who may hold EGP cash on behalf of Temantiket */
  cashHolders: string[];
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
};

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "app") });
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
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
