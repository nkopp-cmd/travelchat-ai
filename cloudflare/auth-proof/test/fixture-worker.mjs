import worker from "./worker.mjs";

// Loaded only in the test manifest, never in the production bundle.
// All SQL and authentication still execute in workerd against the native D1 binding.
export default {
  async fetch(request, env, ctx) {
    const mode = request.headers.get("x-fixture-body");
    const batchExpiry = Number(request.headers.get("x-fixture-batch-expiry"));
    const accountSession = request.headers.get("x-fixture-account-session");
    const accountMode = request.headers.get("x-fixture-account-mode");
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
    if (batchExpiry || accountSession) {
      const native = env.DB;
      env = { ...env, DB: new Proxy(native, {
        get(target, property) {
          if (property === "batch") return async (statements) => {
            if (accountSession) {
              if (accountMode === "expire") await native.prepare("UPDATE session SET expiresAt = 0 WHERE id = ?").bind(accountSession).run();
              if (accountMode === "revoke") await native.prepare("DELETE FROM session WHERE id = ?").bind(accountSession).run();
              if (accountMode === "unverify") await native.prepare("UPDATE user SET emailVerified = 0 WHERE id = (SELECT userId FROM session WHERE id = ?)").bind(accountSession).run();
              if (accountMode === "unlink") await native.prepare("DELETE FROM identity_links WHERE authUserId = (SELECT userId FROM session WHERE id = ?)").bind(accountSession).run();
            }
            beforeBatch = (await native.prepare("SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS ms").first()).ms;
            if (batchExpiry) await new Promise((resolve) => setTimeout(resolve, Math.max(0, batchExpiry - Date.now() + 200)));
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
