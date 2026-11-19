import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Files are shared by an unguessable token so a link can be sent over WhatsApp.
export async function GET(_req: Request, ctx: RouteContext<"/f/[token]">) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const f = await db.query.files.findFirst({ where: eq(schema.files.shareToken, token) });
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(f.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
