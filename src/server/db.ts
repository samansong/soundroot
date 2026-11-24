// Database access layer.
// Development uses Node's built-in SQLite (zero native deps). All SQL is written to be
// portable to PostgreSQL; see README "Production database" for the migration notes.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type SqliteModule = typeof import("node:sqlite");

const g = globalThis as unknown as { __soundrootDb?: DatabaseSync };

export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function db(): DatabaseSync {
  if (g.__soundrootDb) return g.__soundrootDb;
  // getBuiltinModule keeps bundlers from trying to resolve node:sqlite.
  const sqlite = process.getBuiltinModule("node:sqlite") as SqliteModule;
  const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH || "data/soundroot.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new sqlite.DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const schema = fs.readFileSync(path.resolve(/*turbopackIgnore: true*/ process.cwd(), "src/server/schema.sql"), "utf8");
  conn.exec(schema);
  g.__soundrootDb = conn;
  return conn;
}

// Rows are loosely typed at the SQL boundary; services shape them into typed DTOs.
export type Row = any;
type Params = SQLInputValue[];

// node:sqlite yields null-prototype rows; copy into plain objects so they serialize everywhere.
export function one<T = Row>(sql: string, ...params: Params): T | undefined {
  const r = db().prepare(sql).get(...params);
  return (r ? { ...r } : undefined) as T | undefined;
}
export function all<T = Row>(sql: string, ...params: Params): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}
export function run(sql: string, ...params: Params) {
  return db().prepare(sql).run(...params);
}

let txDepth = 0;
/**
 * Runs fn inside a write transaction. BEGIN IMMEDIATE takes the write lock up-front, so
 * check-then-insert sequences (booking collisions, exclusive holds) are serialized.
 * In PostgreSQL the same code paths use SERIALIZABLE / exclusion constraints.
 */
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  } finally {
    txDepth--;
  }
}

export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const addMinutes = (d: Date | string, m: number) =>
  new Date(new Date(d).getTime() + m * 60_000).toISOString();

export function insert(table: string, row: Row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
  return run(sql, ...keys.map((k) => normalize(row[k])));
}

function normalize(v: unknown): SQLInputValue {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v !== null && typeof v === "object" && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v as SQLInputValue;
}
