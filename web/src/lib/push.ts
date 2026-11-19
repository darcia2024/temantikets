import { eq } from "drizzle-orm";
import { sendNotification, setVapidDetails } from "web-push";
import { getDb, schema } from "@/db";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Send to every subscribed device of the owner. Returns how many were delivered. */
export async function pushToOwner(payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const db = await getDb();
  const subs = await db.select().from(schema.pushSubscriptions);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription.
        if (code === 404 || code === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      }
    }),
  );
  return sent;
}
