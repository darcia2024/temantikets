"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/action";
import { bool, str } from "@/lib/form";
import { logoutMember, requireMember } from "@/lib/member";
import { failPublic, publicGuard, saveCustomerUploads } from "@/lib/proofs";
import { pushToOwner } from "@/lib/push";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function logout() {
  await logoutMember();
  redirect("/akun/masuk");
}

function passengerFields(formData: FormData) {
  const fullName = str(formData, "fullName")?.toUpperCase().slice(0, 120);
  if (!fullName) failPublic("nama");
  const birthDate = str(formData, "birthDate");
  const passportExpiry = str(formData, "passportExpiry");
  if ((birthDate && !DATE.test(birthDate)) || (passportExpiry && !DATE.test(passportExpiry))) failPublic("tanggal");
  return {
    fullName: fullName!,
    passportNo: str(formData, "passportNo")?.toUpperCase().slice(0, 20) ?? null,
    birthDate,
    passportExpiry,
    isStudent: bool(formData, "isStudent"),
  };
}

/** Add (passengerId null) or update one of the member's saved passengers. */
export async function savePassenger(passengerId: number | null, formData: FormData) {
  const me = await requireMember();
  await publicGuard(
    "/akun/penumpang",
    async () => {
      const db = await getDb();
      const fields = passengerFields(formData);
      if (passengerId == null) {
        const [p] = await db.insert(schema.passengers).values({ customerId: me.id, ...fields }).returning();
        await audit("passenger", p.id, "create", null, p, `member:${me.id}`);
      } else {
        const before = await db.query.passengers.findFirst({
          where: and(eq(schema.passengers.id, passengerId), eq(schema.passengers.customerId, me.id)),
        });
        if (!before) failPublic("tidak_ditemukan");
        const [after] = await db.update(schema.passengers).set(fields).where(eq(schema.passengers.id, passengerId)).returning();
        await audit("passenger", passengerId, "update", before, after, `member:${me.id}`);
      }
      revalidatePath("/akun/penumpang");
    },
    "tersimpan",
  );
}

export async function uploadPassport(passengerId: number, formData: FormData) {
  const me = await requireMember();
  await publicGuard(
    "/akun/penumpang",
    async () => {
      const db = await getDb();
      const p = await db.query.passengers.findFirst({
        where: and(eq(schema.passengers.id, passengerId), eq(schema.passengers.customerId, me.id)),
      });
      if (!p) failPublic("tidak_ditemukan");
      const ids = await saveCustomerUploads(formData, "files", { passengerId }, "paspor", "member");
      await audit("passenger", passengerId, "upload:paspor", null, { files: ids.length }, `member:${me.id}`);
      revalidatePath("/akun/penumpang");
    },
    "diupload",
  );
}

/** Passport/ticket scans or day-of-travel photos for a VOA order. */
export async function uploadVoaDocs(voaId: number, formData: FormData) {
  const me = await requireMember();
  await publicGuard(
    "/akun",
    async () => {
      const db = await getDb();
      const v = await db.query.voaOrders.findFirst({
        where: and(eq(schema.voaOrders.id, voaId), eq(schema.voaOrders.customerId, me.id)),
      });
      if (!v) failPublic("tidak_ditemukan");
      if (v!.status === "batal") failPublic("batal");
      const kind = str(formData, "kind") === "boarding" ? "boarding" : "dokumen";
      const ids = await saveCustomerUploads(formData, "files", { voaId }, kind, "member");
      await audit("voa", voaId, `upload:${kind}`, null, { files: ids.length }, `member:${me.id}`);
      await pushToOwner({
        title: kind === "boarding" ? "Foto hari H masuk" : "Dokumen VOA masuk",
        body: `${v!.code} · ${me.name} · ${ids.length} file`,
        url: `/admin/voa/${voaId}`,
        tag: `voa-docs-${voaId}`,
      }).catch(() => 0);
      revalidatePath("/akun");
    },
    "diupload",
  );
}
