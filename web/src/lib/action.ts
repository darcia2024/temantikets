import { redirect, unstable_rethrow } from "next/navigation";
import { getDb, schema } from "@/db";

/** A mistake the user can fix. Its message is shown on the page. */
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

function withParam(path: string, key: string, value: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("ok");
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/**
 * Run a Server Action body. UserError → back to `back` with ?error=<message>
 * (production hides thrown messages, so this is how the user sees them).
 * On success, optionally redirect with ?ok=<message>.
 */
export async function guard(back: string, fn: () => Promise<void | string>, ok?: string): Promise<void> {
  let target: string | null = null;
  try {
    const next = await fn();
    target = typeof next === "string" ? next : ok ? withParam(back, "ok", ok) : null;
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) target = withParam(back, "error", err.message);
    else throw err;
  }
  if (target) redirect(target);
}

type Json = Record<string, unknown> | null | undefined;

function clean(row: Json): Json {
  if (!row) return row ?? null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    // Never copy file bytes into the audit log.
    if (k === "data" && (Buffer.isBuffer(v) || v instanceof Uint8Array)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** Record who changed what. before/after are whole rows (or the changed fields). */
export async function audit(
  entity: string,
  entityId: number | null,
  action: string,
  before?: Json,
  after?: Json,
  actor = "owner",
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    actor,
    entity,
    entityId,
    action,
    before: clean(before),
    after: clean(after),
  });
}
