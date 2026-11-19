import { beforeAll, describe, expect, it } from "vitest";

// Use an in-memory database for the app's own getDb() (migrations run on first use).
process.env.PGLITE_DIR = "memory://";

const { getDb, schema } = await import("@/db");
const { saveUploads } = await import("@/lib/files");
const { UserError } = await import("@/lib/action");
const { GET: serveFile } = await import("@/app/f/[token]/route");
const { GET: lacak } = await import("@/app/api/lacak/[kode]/route");

const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let bookingId: number;

beforeAll(async () => {
  const db = await getDb();
  const [c] = await db.insert(schema.customers).values({ name: "Upload Tes", wa: "6281200000077" }).returning();
  const [b] = await db.insert(schema.bookings).values({ code: "TT-2611-UPLD", customerId: c.id, route: "CGK-CAI" }).returning();
  bookingId = b.id;
  await db.insert(schema.voaOrders).values({ code: "VOA-2611-LCK2", customerId: c.id, status: "dp", pax: 2, flightNo: "MS 961" });
});

describe("file upload", () => {
  it("stores a PDF e-ticket and serves it by share link", async () => {
    const fd = new FormData();
    fd.append("files", new File([pdfBytes], "eticket ahmad.pdf", { type: "application/pdf" }));
    expect(await saveUploads(fd, "files", { bookingId }, "tiket")).toBe(1);

    const db = await getDb();
    const [f] = await db.select().from(schema.files);
    expect(f.filename).toBe("eticket ahmad.pdf");
    expect(f.shareToken).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const res = await serveFile(new Request("http://x"), { params: Promise.resolve({ token: f.shareToken }) } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("eticket%20ahmad.pdf");
    expect(Buffer.from(await res.arrayBuffer()).equals(pdfBytes)).toBe(true);
  });

  it("ignores empty file inputs", async () => {
    const fd = new FormData();
    fd.append("files", new File([], "", { type: "application/octet-stream" }));
    expect(await saveUploads(fd, "files", { bookingId }, "tiket")).toBe(0);
  });

  it("rejects non-PDF/photo files and files over 10 MB", async () => {
    const exe = new FormData();
    exe.append("files", new File(["MZ"], "virus.exe", { type: "application/x-msdownload" }));
    // UserError, so guard() shows the message on the page instead of a generic error screen.
    await expect(saveUploads(exe, "files", { bookingId }, "tiket")).rejects.toThrow(UserError);
    await expect(saveUploads(exe, "files", { bookingId }, "tiket")).rejects.toThrow(/hanya PDF atau foto/);

    const big = new FormData();
    big.append("files", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "besar.pdf", { type: "application/pdf" }));
    await expect(saveUploads(big, "files", { bookingId }, "tiket")).rejects.toThrow(/lebih dari 10 MB/);
  });

  it("returns 404 for unknown or malformed share tokens", async () => {
    const bad = await serveFile(new Request("http://x"), { params: Promise.resolve({ token: "../../etc/passwd" }) } as never);
    expect(bad.status).toBe(404);
    const missing = await serveFile(new Request("http://x"), { params: Promise.resolve({ token: "A".repeat(24) }) } as never);
    expect(missing.status).toBe(404);
  });
});

describe("lacak API", () => {
  it("returns status without personal data, with CORS for the VOA site only", async () => {
    process.env.LACAK_ALLOWED_ORIGINS = "https://voatemantiket.site";
    const req = (origin: string) =>
      new Request("http://x/api/lacak/voa-2611-lck2", { headers: { origin } }) as unknown as Parameters<typeof lacak>[0];
    const ctx = { params: Promise.resolve({ kode: "voa-2611-lck2" }) } as never;

    const ok = await lacak(req("https://voatemantiket.site"), ctx);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://voatemantiket.site");
    const body = await ok.json();
    expect(body.status).toBe("dp");
    expect(JSON.stringify(body)).not.toMatch(/Upload Tes|6281200000077/);

    const other = await lacak(req("https://evil.example"), ctx);
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
