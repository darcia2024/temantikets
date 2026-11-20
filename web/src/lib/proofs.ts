import { and, count, eq } from "drizzle-orm";
import { redirect, unstable_rethrow } from "next/navigation";
import { getDb, schema } from "@/db";
import { CURRENCIES, type Currency } from "@/db/schema";
import type { PublicMessage } from "@/components/public-flash";
import { audit, UserError } from "./action";
import { saveUploads, type FileTarget } from "./files";
import { str } from "./form";
import { parseAmount } from "./money";
import { pushToOwner } from "./push";

/** Error with a fixed public message key (see public-flash.tsx). */
export class PublicError extends Error {
  constructor(public key: PublicMessage) {
    super(key);
  }
}
export const failPublic = (key: PublicMessage): never => {
  throw new PublicError(key);
};

/** guard() for public pages: errors and success are passed as message keys only. */
export async function publicGuard(back: string, fn: () => Promise<void | string>, ok?: PublicMessage): Promise<void> {
  const sep = back.includes("?") ? "&" : "?";
  let target: string | null = null;
  try {
    const next = await fn();
    target = typeof next === "string" ? next : ok ? `${back}${sep}ok=${ok}` : null;
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof PublicError) target = `${back}${sep}error=${err.key}`;
    else throw err;
  }
  if (target) redirect(target);
}

/** Store files from a customer; maps any validation problem to the "file" message. */
export async function saveCustomerUploads(
  formData: FormData,
  field: string,
  target: FileTarget,
  kind: Parameters<typeof saveUploads>[3],
  uploadedBy: "member" | "link",
): Promise<number[]> {
  try {
    const ids = await saveUploads(formData, field, target, kind, { uploadedBy, max: 5 });
    if (ids.length === 0) failPublic("kosong");
    return ids;
  } catch (err) {
    if (err instanceof UserError) failPublic("file");
    throw err;
  }
}

type Order = { id: number; code: string; status: string; kind: "booking" | "voa" };

/** A customer (member area or pay link) sends a transfer receipt for the owner to check. */
export async function submitProof(order: Order, formData: FormData, source: "member" | "link", actor: string): Promise<void> {
  if (order.status === "batal") failPublic("batal");
  const amount = parseAmount(formData.get("amount"));
  if (!amount || amount <= 0) failPublic("nominal");
  const currency = (str(formData, "currency") ?? "IDR") as Currency;
  if (!CURRENCIES.includes(currency)) failPublic("nominal");
  const db = await getDb();
  const target = order.kind === "booking" ? { bookingId: order.id } : { voaId: order.id };
  const targetCol = order.kind === "booking" ? schema.paymentProofs.bookingId : schema.paymentProofs.voaId;
  // Keeps an open link from being used to flood the database.
  const [pending] = await db
    .select({ n: count() })
    .from(schema.paymentProofs)
    .where(and(eq(targetCol, order.id), eq(schema.paymentProofs.status, "menunggu")));
  if (pending.n >= 3) failPublic("antre");
  const file = formData.get("bukti");
  if (!(file instanceof File) || file.size === 0) failPublic("bukti");
  const [fileId] = await saveCustomerUploads(formData, "bukti", target, "bukti", source);
  const [proof] = await db
    .insert(schema.paymentProofs)
    .values({
      ...target,
      fileId,
      currency,
      amount: amount!,
      payerName: str(formData, "payerName")?.slice(0, 120) ?? null,
      note: str(formData, "note")?.slice(0, 500) ?? null,
      source,
    })
    .returning();
  await audit("payment_proof", proof.id, "create", null, proof, actor);
  await pushToOwner({
    title: "Bukti transfer masuk",
    body: `${order.code}: ${currency} ${amount!.toLocaleString("id-ID")}`,
    url: order.kind === "booking" ? `/admin/tiket/${order.id}` : `/admin/voa/${order.id}`,
    tag: `proof-${proof.id}`,
  }).catch(() => 0);
}
