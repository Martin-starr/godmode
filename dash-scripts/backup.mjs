// Weekly off-site copy of the dashboard's data.
//
// Supabase does not keep automatic backups for Free-plan projects and pauses
// them after a quiet week, so the data must exist somewhere Martin owns. This
// dumps the `dash` and `seo` schemas with pg_dump, gzips the result, and
// uploads it to a folder in Martin's Google Drive that is shared with the
// same service account the SEO agent already uses (GOOGLE_SERVICE_ACCOUNT_JSON).
// Copies older than KEEP_DAYS that the service account itself uploaded are
// pruned so the folder does not grow forever.
//
// Run by .github/workflows/backup-weekly.yml. Locally:
//   DASH_DATABASE_URL=... GOOGLE_SERVICE_ACCOUNT_JSON=... BACKUP_DRIVE_FOLDER_ID=... node dash-scripts/backup.mjs
// Without BACKUP_DRIVE_FOLDER_ID the dump is written locally and the upload is skipped.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { accessToken, serviceAccountEmail, googleConfigured } from "../seo/lib/google-auth.mjs";

const SCOPE_DRIVE = ["https://www.googleapis.com/auth/drive"];
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 90);
const OUT_DIR = process.env.BACKUP_OUT_DIR || "backup";

function databaseUrl() {
  const url = process.env.DASH_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DASH_DATABASE_URL mangler.");
  // pg_dump needs a real session; the transaction-mode pooler (6543) breaks
  // it. Session mode on 5432 through the same pooler host works.
  return url.replace(/:6543\//, ":5432/");
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
}

async function dump(file) {
  // --enable-row-security: the seo tables have RLS with a single policy that
  // grants dash_app every row, so the dump is complete; without the flag
  // pg_dump refuses to COPY them at all.
  const args = ["--schema=dash", "--schema=seo", "--enable-row-security", "--no-owner", "--no-privileges", "--format=plain", "--dbname", databaseUrl()];
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.PG_DUMP || "pg_dump", args, { stdio: ["ignore", "pipe", "inherit"] });
    const out = createWriteStream(file);
    pipeline(child.stdout, createGzip({ level: 9 }), out).then(resolve, reject);
    child.on("error", reject);
    child.on("exit", (code) => { if (code !== 0) reject(new Error("pg_dump avsluttet med kode " + code)); });
  });
  return statSync(file).size;
}

async function drive(path, init, scopes = SCOPE_DRIVE) {
  const token = await accessToken(scopes);
  const res = await fetch("https://www.googleapis.com" + path, {
    ...init,
    headers: { ...(init.headers || {}), authorization: "Bearer " + token },
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error("Google Drive " + res.status + " på " + path.split("?")[0] + ": " + (data.error?.message || text.slice(0, 300)));
  return data;
}

async function upload(file, name, folderId) {
  const boundary = "dashbackup" + Date.now();
  const meta = Buffer.from(JSON.stringify({ name, parents: [folderId], mimeType: "application/gzip" }));
  const chunks = [];
  for await (const c of createReadStream(file)) chunks.push(c);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n`), meta,
    Buffer.from(`\r\n--${boundary}\r\ncontent-type: application/gzip\r\n\r\n`), ...chunks,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return drive("/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,webViewLink", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}`, "content-length": String(body.length) },
    body,
  });
}

async function prune(folderId) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const q = encodeURIComponent(`'${folderId}' in parents and 'me' in owners and name contains 'dash-backup_' and createdTime < '${cutoff}' and trashed = false`);
  const list = await drive(`/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { method: "GET" });
  for (const f of list.files || []) {
    await drive(`/drive/v3/files/${f.id}?supportsAllDrives=true`, { method: "DELETE" });
    console.log("slettet gammel kopi:", f.name);
  }
  return (list.files || []).length;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const name = `dash-backup_${stamp()}.sql.gz`;
  const file = `${OUT_DIR}/${name}`;
  const bytes = await dump(file);
  if (bytes < 1024) throw new Error("Dumpen er bare " + bytes + " byte — noe er galt.");
  console.log(`dump: ${file} (${(bytes / 1024).toFixed(0)} kB)`);

  const folderId = process.env.BACKUP_DRIVE_FOLDER_ID;
  if (!googleConfigured()) { console.log("GOOGLE_SERVICE_ACCOUNT_JSON mangler — hopper over Drive-opplasting."); return; }
  if (!folderId) {
    console.log("BACKUP_DRIVE_FOLDER_ID mangler — hopper over Drive-opplasting.");
    console.log("Del backup-mappen i Drive (som redaktør) med:", serviceAccountEmail());
    return;
  }
  console.log("service-konto:", serviceAccountEmail(), "→ mappe", folderId);
  const up = await upload(file, name, folderId);
  console.log(`lastet opp til Drive: ${up.name} (${up.id}) ${up.webViewLink || ""}`);
  const pruned = await prune(folderId);
  console.log(`ryddet ${pruned} kopier eldre enn ${KEEP_DAYS} dager`);
}

main().catch((e) => { console.error("::error::" + e.message); process.exit(1); });
