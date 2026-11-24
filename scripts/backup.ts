// Consistent backup of the database + private file storage.
// Writes BACKUP_DIR/soundroot-<timestamp>.db (online SQLite backup) and .tar.gz of storage,
// then deletes backups older than BACKUP_KEEP_DAYS (default 14).
// Usage: node scripts/backup.ts
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const dbFile = path.resolve(process.cwd(), process.env.DATABASE_PATH || "data/soundroot.db");
const storage = path.resolve(process.cwd(), process.env.STORAGE_DIR || "data/storage");
const outDir = path.resolve(process.env.BACKUP_DIR || "backups");
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);

if (!fs.existsSync(dbFile)) {
  console.log(`No database at ${dbFile} — nothing to back up.`);
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// Online backup: safe while the app is running (WAL mode).
const db = new sqlite.DatabaseSync(dbFile);
const dbOut = path.join(outDir, `soundroot-${stamp}.db`);
await sqlite.backup(db, dbOut);
db.close();
console.log(`database -> ${dbOut}`);

if (fs.existsSync(storage)) {
  const tarOut = path.join(outDir, `storage-${stamp}.tar.gz`);
  execFileSync("tar", ["--force-local", "-czf", tarOut, "-C", path.dirname(storage), path.basename(storage)]);
  console.log(`storage  -> ${tarOut}`);
}

const cutoff = Date.now() - keepDays * 86400_000;
for (const f of fs.readdirSync(outDir)) {
  const p = path.join(outDir, f);
  if (/^(soundroot|storage)-.*\.(db|tar\.gz)$/.test(f) && fs.statSync(p).mtimeMs < cutoff) {
    fs.rmSync(p);
    console.log(`pruned   ${f}`);
  }
}
