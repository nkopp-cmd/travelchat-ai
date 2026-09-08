import worker from "./worker.mjs";

// Loaded only in the test manifest, never in the production bundle.
// All SQL and authentication still execute in workerd against the native D1 binding.
export default {
  async fetch(request, env, ctx) {
    const mode = request.headers.get("x-fixture-body");
    const batchExpiry = Number(request.headers.get("x-fixture-batch-expiry"));
    let cancelled = false;
    let chunks = 0;
    let beforeBatch;
    let afterDelay;
    if (mode) {
      let interval;
      const body = new ReadableStream({
        start(controller) {
          if (mode === "error") controller.error(new Error("Synthetic private read error"));
          if (mode === "trickle") interval = setInterval(() => {
            chunks++;
            controller.enqueue(new TextEncoder().encode(" "));
          }, 700);
        },
        cancel() {
          cancelled = true;
          clearInterval(interval);
          return Promise.reject(new Error("Synthetic cancellation failure"));
        },
      });
      request = new Request(request.url, { method: "POST", headers: request.headers, body });
    }
    if (batchExpiry) {
      const native = env.DB;
      env = { ...env, DB: new Proxy(native, {
        get(target, property) {
          if (property === "batch") return async (statements) => {
            beforeBatch = (await native.prepare("SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS ms").first()).ms;
            await new Promise((resolve) => setTimeout(resolve, Math.max(0, batchExpiry - Date.now() + 200)));
            afterDelay = (await native.prepare("SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS ms").first()).ms;
            return native.batch(statements);
          };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) };
    }
    const response = await worker.fetch(request, env, ctx);
    response.headers.set("x-fixture-cancelled", String(cancelled));
    response.headers.set("x-fixture-chunks", String(chunks));
    if (beforeBatch !== undefined) response.headers.set("x-fixture-before-batch", String(beforeBatch));
    if (afterDelay !== undefined) response.headers.set("x-fixture-after-delay", String(afterDelay));
    return response;
  },
};
