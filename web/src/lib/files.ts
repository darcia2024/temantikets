import { getDb, schema } from "@/db";
import type { FileKind } from "@/db/schema";
import { fail } from "./action";
import { newToken } from "./codes";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

export type FileTarget = { bookingId?: number; voaId?: number; passengerId?: number };

/** Saves every non-empty file in `field`. Returns the new file ids. */
export async function saveUploads(
  formData: FormData,
  field: string,
  target: FileTarget,
  kind: FileKind,
  opts: { uploadedBy?: "owner" | "member" | "link"; max?: number } = {},
): Promise<number[]> {
  const db = await getDb();
  const uploads = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (opts.max != null && uploads.length > opts.max) fail(`Maksimal ${opts.max} file sekali upload.`);
  // Validate everything first so a bad file doesn't leave half an upload behind.
  for (const f of uploads) {
    if (f.size > MAX_BYTES) fail(`${f.name} lebih dari 10 MB. Kompres dulu atau kirim per halaman.`);
    if (!ALLOWED.includes(f.type)) fail(`${f.name}: hanya PDF atau foto (JPG/PNG/WEBP/HEIC) yang bisa diupload.`);
  }
  const ids: number[] = [];
  for (const f of uploads) {
    const [row] = await db
      .insert(schema.files)
      .values({
        kind,
        bookingId: target.bookingId ?? null,
        voaId: target.voaId ?? null,
        passengerId: target.passengerId ?? null,
        uploadedBy: opts.uploadedBy ?? "owner",
        filename: f.name.slice(0, 200),
        mime: f.type,
        size: f.size,
        data: Buffer.from(await f.arrayBuffer()),
        shareToken: newToken(),
      })
      .returning({ id: schema.files.id });
    ids.push(row.id);
  }
  return ids;
}
