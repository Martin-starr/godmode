import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 25;

const MAX_BYTES = 25 * 1024 * 1024;

function humanSize(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

function today() {
  const d = new Date();
  return (
    String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear()
  );
}

export const POST = guarded(
  async (req) => {
    const form = await req.formData();
    const cat = String(form.get("cat") || "SOP");
    const uploads = form.getAll("files").filter((f) => typeof f === "object" && f.name);
    if (!uploads.length) return err("Ingen filer mottatt.");
    const sql = db();
    const out = [];
    for (const file of uploads) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > MAX_BYTES) return err("«" + file.name + "» er større enn 25 MB.");
      const rows = await sql`insert into dash.files (name, cat, ver, date, size, content)
        values (${file.name}, ${cat}, 'v1.0', ${today()}, ${humanSize(buf.length)}, ${buf})
        returning id, name, cat, ver, date, size, (content is not null) as stored`;
      out.push(rows[0]);
    }
    if (!out.length) return err("Kun PDF-filer støttes.");
    return json(out);
  },
  { edit: true }
);
