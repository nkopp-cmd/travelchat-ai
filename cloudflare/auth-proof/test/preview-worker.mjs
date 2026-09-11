import worker from "./worker.mjs";
import { sendPreviewMail } from "./mail.mjs";

// Test manifest only. This module never enters a deployable bundle.
const messages = [];
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const fixture = request.headers.get("x-fixture-nonce") === env.FIXTURE_NONCE;
    if (url.pathname.startsWith("/__fixture/")) {
      if (!fixture) return new Response(null, { status: 404 });
      if (url.pathname === "/__fixture/stats") return Response.json(messages);
    }
    const mode = fixture ? request.headers.get("x-fixture-mail") : null;
    const mockEnv = { ...env, NATIVE_EMAIL: { async send(message) {
      const row = await env.DB.prepare("SELECT state FROM preview_mail_jobs ORDER BY rowid DESC LIMIT 1").first();
      if (row?.state !== "sending") throw new Error("Missing send fence");
      messages.push(message);
      if (mode === "reject") throw new Error("Synthetic private provider error");
      if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 10500));
      if (mode === "no-receipt") return {};
      return { messageId: `fixture-${messages.length}` };
    } } };
    if (fixture && url.pathname === "/__fixture/mail") {
      const data = await request.json();
      try {
        await sendPreviewMail(mockEnv, { kind: "human", email: "alice@example.test" }, "verify", "fixture-user", data.email ?? "alice@example.test", data.url);
        return Response.json({ ok: true });
      } catch { return Response.json({ ok: false }, { status: 500 }); }
    }
    return worker.fetch(request, mockEnv, ctx);
  },
};
