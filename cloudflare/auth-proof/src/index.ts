import { createAuth } from "./auth";
import { redeemClaim } from "./claim";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const base = new URL(env.AUTH_BASE_URL);
      const local = base.hostname === "localhost" || base.hostname.endsWith(".test");
      if (env.LOCAL_PROOF !== "true" || !local || base.protocol !== "https:" || base.origin !== env.AUTH_BASE_URL
        || url.origin !== base.origin || env.BETTER_AUTH_SECRET.length < 32 || env.CLAIM_SECRET.length < 32) return json({ error: "Local proof only" }, 403);
      // Never trust caller-provided proxy IPs in this local-only harness.
      const headers = new Headers(request.headers);
      headers.set("x-local-proof-ip", "127.0.0.1");
      let body: Uint8Array | undefined;
      if (request.body) {
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        let complete = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // One deadline covers the whole body, not a renewable timeout for each chunk.
        const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 5000); });
        try {
          while (true) {
            const next = await Promise.race([reader.read(), deadline]);
            if (next === null) return json({ error: "Body read timeout" }, 408);
            if (next.done) { complete = true; break; }
            size += next.value.byteLength;
            if (size > 16 * 1024) return json({ error: "Body too large" }, 413);
            chunks.push(next.value);
          }
        } catch {
          return json({ error: "Body read failed" }, 400);
        } finally {
          clearTimeout(timer);
          // A stalled or rejecting source cancellation must not delay the error response.
          if (!complete) ctx.waitUntil(reader.cancel().catch(() => undefined));
          reader.releaseLock();
        }
        body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      }
      request = new Request(request.url, { method: request.method, headers, body });
      const auth = createAuth(env);
      if (url.pathname.startsWith("/api/auth/")) {
        const response = await auth.handler(request);
        if (response.status >= 500) return json({ error: "Local proof failure" }, 500);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const path = url.pathname;
      if (path !== "/api/session" && path !== "/api/account/new" && path !== "/api/account/claim"
        && path !== "/api/private-notes" && !/^\/api\/private-notes\/[^/]+$/.test(path)) return json({ error: "Not found" }, 404);
      if (!["GET", "HEAD"].includes(request.method) && headers.get("Origin") !== base.origin) return json({ error: "Invalid origin" }, 403);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return json({ error: "Unauthorized" }, 401);
      if (!session.user.emailVerified) return json({ error: "Verify email" }, 403);
      if (path === "/api/session" && request.method === "GET") {
        const link = await env.DB.prepare("SELECT ownerId FROM identity_links WHERE authUserId = ?").bind(session.user.id).first();
        return json({ userId: session.user.id, emailVerified: true, ownerId: link?.ownerId ?? null });
      }
      let data: Record<string, unknown> = {};
      if (body?.length) {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Invalid body" }, 400);
        data = parsed as Record<string, unknown>;
      }
      if (path === "/api/account/claim" && request.method === "POST") {
        if (Object.keys(data).length !== 1 || typeof data.token !== "string") return json({ error: "Invalid body" }, 400);
        return await redeemClaim(env, data.token, session.user.id) ? json({ linked: true }) : json({ error: "Claim rejected" }, 409);
      }
      if (path === "/api/account/new" && request.method === "POST") {
        if (Object.keys(data).length) return json({ error: "Server-owned identity" }, 400);
        const ownerId = crypto.randomUUID();
        const result = await env.DB.batch([
          env.DB.prepare("INSERT INTO owners (id, source) SELECT ?, 'new' WHERE NOT EXISTS (SELECT 1 FROM identity_links WHERE authUserId = ?)").bind(ownerId, session.user.id),
          env.DB.prepare("INSERT INTO identity_links (authUserId, ownerId) SELECT ?, ? WHERE changes() = 1").bind(session.user.id, ownerId),
        ]);
        return result[1].meta.changes === 1 ? json({ ownerId }, 201) : json({ error: "Already linked" }, 409);
      }
      const link = await env.DB.prepare("SELECT ownerId FROM identity_links WHERE authUserId = ?").bind(session.user.id).first<{ ownerId: string }>();
      if (!link) return json({ error: "Choose new account or claim legacy identity" }, 409);
      const ownerId = link.ownerId;
      const id = path.startsWith("/api/private-notes/") ? decodeURIComponent(path.slice("/api/private-notes/".length)) : null;
      if (path === "/api/private-notes" && request.method === "GET") return json((await env.DB.prepare("SELECT id, body FROM private_notes WHERE ownerId = ? ORDER BY id LIMIT 100").bind(ownerId).all()).results);
      if (id && request.method === "GET") {
        const note = await env.DB.prepare("SELECT id, body FROM private_notes WHERE id = ? AND ownerId = ?").bind(id, ownerId).first();
        return note ? json(note) : json({ error: "Not found" }, 404);
      }
      if ((path === "/api/private-notes" && request.method === "POST") || (id && request.method === "PATCH")) {
        if (Object.keys(data).length !== 1 || typeof data.body !== "string" || !data.body.length || data.body.length > 4000) return json({ error: "Only body accepted" }, 400);
        if (!id) {
          const noteId = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO private_notes (id, ownerId, body) VALUES (?, ?, ?)").bind(noteId, ownerId, data.body).run();
          return json({ id: noteId }, 201);
        }
        const result = await env.DB.prepare("UPDATE private_notes SET body = ? WHERE id = ? AND ownerId = ?").bind(data.body, id, ownerId).run();
        return result.meta.changes ? json({ updated: true }) : json({ error: "Not found" }, 404);
      }
      if (id && request.method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM private_notes WHERE id = ? AND ownerId = ?").bind(id, ownerId).run();
        return result.meta.changes ? json({ deleted: true }) : json({ error: "Not found" }, 404);
      }
      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      // Do not log library exceptions: SQL parameters can contain credentials.
      return json({ error: "Local proof failure" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
