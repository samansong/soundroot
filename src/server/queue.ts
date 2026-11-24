// Durable job queue backed by the database (prod: Redis/BullMQ or SQS; same handler contract).
// Used for audio processing, webhook delivery retries and expiry sweeps.
import { addMinutes, insert, now, one, run, uuid } from "./db.ts";

type Handler = (payload: any) => Promise<void> | void;
const handlers = new Map<string, Handler>();
const g = globalThis as unknown as { __srWorker?: NodeJS.Timeout; __srSweeps?: (() => void)[] };

export function registerJob(type: string, h: Handler) {
  handlers.set(type, h);
}

export function enqueue(type: string, payload: unknown, delaySeconds = 0) {
  const id = uuid();
  insert("jobs", {
    id,
    type,
    payload: JSON.stringify(payload),
    status: "queued",
    attempts: 0,
    run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    created_at: now(),
  });
  return id;
}

export function registerSweep(fn: () => void) {
  g.__srSweeps ??= [];
  g.__srSweeps.push(fn);
}

let busy = false;
export async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (const s of g.__srSweeps ?? []) {
      try { s(); } catch (e) { console.error("[sweep]", e); }
    }
    for (let i = 0; i < 5; i++) {
      const job = one(
        `UPDATE jobs SET status='running', attempts = attempts + 1
         WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after <= ? ORDER BY run_after LIMIT 1)
         RETURNING *`,
        now(),
      );
      if (!job) break;
      const h = handlers.get(job.type);
      try {
        if (!h) throw new Error(`No handler for ${job.type}`);
        await h(JSON.parse(job.payload));
        run("UPDATE jobs SET status='done', last_error=NULL WHERE id=?", job.id);
      } catch (e: any) {
        const failed = job.attempts >= 6;
        // Exponential backoff: 2^attempts seconds
        run(
          "UPDATE jobs SET status=?, last_error=?, run_after=? WHERE id=?",
          failed ? "failed" : "queued",
          String(e?.message ?? e).slice(0, 500),
          addMinutes(new Date(), Math.pow(2, job.attempts) / 60),
          job.id,
        );
        console.error(`[job ${job.type}] attempt ${job.attempts} failed:`, e?.message ?? e);
      }
    }
  } finally {
    busy = false;
  }
}

export function startWorker() {
  if (g.__srWorker) return;
  g.__srWorker = setInterval(() => void tick(), 1000);
  console.log("[worker] started");
}
