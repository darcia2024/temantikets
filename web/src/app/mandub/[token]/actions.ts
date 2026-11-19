"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { MANDUB_STATUS, type MandubStatus } from "@/db/schema";
import { audit, fail, guard } from "@/lib/action";
import { isMandubToken } from "@/lib/auth";
import { str } from "@/lib/form";
import { mandubStatusMeta } from "@/lib/status";

export async function setMandubStatus(token: string, voaId: number, formData: FormData) {
  if (!isMandubToken(token)) fail("Link tidak valid.");
  const back = `/mandub/${token}`;
  await guard(back, async () => {
    const to = str(formData, "to") as MandubStatus;
    if (!MANDUB_STATUS.includes(to)) fail("Status tidak valid.");
    const db = await getDb();
    const v = await db.query.voaOrders.findFirst({ where: eq(schema.voaOrders.id, voaId) });
    if (!v || v.status === "batal") fail("Order tidak ditemukan atau sudah dibatalkan.");
    // Mandub progress also moves the order status so Lacak Order stays in sync.
    const synced = to === "keluar" ? "selesai" : to === "menunggu_gate" || to === "voa_beres" ? "dijemput" : v.status;
    const status = ["lunas", "dijemput", "selesai"].includes(v.status) ? synced : v.status;
    const note = str(formData, "note") ?? v.mandubNote;
    await db
      .update(schema.voaOrders)
      .set({ mandubStatus: to, mandubNote: note, status, updatedAt: new Date() })
      .where(eq(schema.voaOrders.id, voaId));
    await audit("voa", voaId, `mandub:${v.mandubStatus}->${to}`, { mandubStatus: v.mandubStatus, status: v.status }, { mandubStatus: to, status, mandubNote: note }, "mandub");
    revalidatePath(back);
    return `${back}?ok=${encodeURIComponent(`${v.code}: ${mandubStatusMeta[to].label}`)}`;
  });
}
