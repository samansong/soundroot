// Starts the in-process job worker when the Node server boots (dev & `next start`).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./server/index");
}
