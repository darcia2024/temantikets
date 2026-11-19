import type { NextRequest } from "next/server";
import { lacakOrder } from "@/lib/lacak";

// Called from voatemantiket.site's "Lacak Order" box:
//   fetch("https://<APP_URL>/api/lacak/VOA-2611-AB3K").then(r => r.json())
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = (process.env.LACAK_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
  const h: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, OPTIONS";
  }
  return h;
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/lacak/[kode]">) {
  const { kode } = await ctx.params;
  const result = await lacakOrder(kode);
  const headers = corsHeaders(request.headers.get("origin"));
  if (!result) return Response.json({ error: "Kode order tidak ditemukan" }, { status: 404, headers });
  return Response.json(result, { headers });
}
