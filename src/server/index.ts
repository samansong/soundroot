// Importing every module registers its jobs and sweeps with the queue.
import "./modules/catalog.ts";
import "./modules/billing.ts";
import "./modules/studio.ts";
import "./modules/projects.ts";
import "./modules/identity.ts";
import "./modules/admin.ts";
import { startWorker } from "./queue.ts";

// In production the worker runs as a separate process (`node worker`); in dev it runs in-process.
if (process.env.NEXT_PHASE !== "phase-production-build") startWorker();
