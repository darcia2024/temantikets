"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireOwner } from "@/lib/auth";
import { pushToOwner } from "@/lib/push";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function subscribePush(sub: Sub) {
  await requireOwner();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Subscription tidak valid");
  const db = await getDb();
  await db
    .insert(schema.pushSubscriptions)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

export async function unsubscribePush(endpoint: string) {
  await requireOwner();
  const db = await getDb();
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
}

export async function testPush(): Promise<number> {
  await requireOwner();
  return pushToOwner({ title: "Temantiket", body: "Notifikasi aktif. Alarm time limit akan muncul di sini.", url: "/admin" });
}
