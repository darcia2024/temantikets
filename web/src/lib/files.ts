import { getDb, schema } from "@/db";
import { fail } from "./action";
import { newToken } from "./codes";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

export async function saveUploads(
  formData: FormData,
  field: string,
  target: { bookingId?: number; voaId?: number },
  kind: "tiket" | "otb" | "bukti" | "boarding" | "lainnya",
): Promise<number> {
  const db = await getDb();
  const uploads = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of uploads) {
    if (f.size > MAX_BYTES) fail(`${f.name} lebih dari 10 MB. Kompres dulu atau kirim per halaman.`);
    if (!ALLOWED.includes(f.type)) fail(`${f.name}: hanya PDF atau foto (JPG/PNG/WEBP/HEIC) yang bisa diupload.`);
    await db.insert(schema.files).values({
      kind,
      bookingId: target.bookingId ?? null,
      voaId: target.voaId ?? null,
      filename: f.name,
      mime: f.type,
      size: f.size,
      data: Buffer.from(await f.arrayBuffer()),
      shareToken: newToken(),
    });
  }
  return uploads.length;
}
