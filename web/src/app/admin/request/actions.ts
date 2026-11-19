"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audit, fail, guard } from "@/lib/action";
import { requireOwner } from "@/lib/auth";

/** Turn a public request into a booking draft, creating the customer if needed. */
export async function processRequest(requestId: number) {
  await requireOwner();
  await guard("/admin/request", async () => {
    const db = await getDb();
    const r = await db.query.ticketRequests.findFirst({ where: eq(schema.ticketRequests.id, requestId) });
    if (!r) fail("Request tidak ditemukan.");
    let customerId = r.customerId;
    if (!customerId) {
      const existing = await db.query.customers.findFirst({ where: eq(schema.customers.wa, r.wa) });
      if (existing) {
        customerId = existing.id;
      } else {
        const [c] = await db.insert(schema.customers).values({ name: r.name, wa: r.wa, source: "web" }).returning();
        await audit("customer", c.id, "create", null, c);
        customerId = c.id;
      }
      await db.update(schema.ticketRequests).set({ customerId }).where(eq(schema.ticketRequests.id, r.id));
    }
    return `/admin/tiket/baru?customer=${customerId}&request=${r.id}`;
  });
}

export async function closeRequest(requestId: number, formData: FormData) {
  await requireOwner();
  await guard(
    "/admin/request",
    async () => {
      const status = formData.get("status") === "selesai" ? "selesai" : "batal";
      const db = await getDb();
      const [r] = await db.update(schema.ticketRequests).set({ status }).where(eq(schema.ticketRequests.id, requestId)).returning();
      if (!r) fail("Request tidak ditemukan.");
      await audit("request", requestId, `status:${status}`, null, { status });
      revalidatePath("/admin/request");
      revalidatePath("/admin");
    },
    "Request ditutup.",
  );
}
