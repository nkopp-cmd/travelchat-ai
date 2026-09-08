import { createAuth } from "./auth";
import { redeemClaim } from "./claim";
import { trustedAppSession } from "./app-session";
import { savedSpots } from "./saved-spots";
import { appError } from "./app-error";
import { catalog } from "./catalog";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const savedRoute = ["/api/spots/save", "/api/spots"].includes(new URL(request.url).pathname);
    const fail = (code: string, message: string, status: number, legacyMessage = message) =>
      savedRoute ? appError(code, message, status) : json({ error: legacyMessage }, status);
    try {
      const url = new URL(request.url);
      const base = new URL(env.AUTH_BASE_URL);
      const local = base.hostname === "localhost" || base.hostname.endsWith(".test");
      if (env.LOCAL_PROOF !== "true" || !local || base.protocol !== "https:" || base.origin !== env.AUTH_BASE_URL
        || url.origin !== base.origin || env.BETTER_AUTH_SECRET.length < 32 || env.CLAIM_SECRET.length < 32) return fail("forbidden", "Local proof only", 403);
      if (request.method === "GET" && url.pathname === "/api/spots") return await catalog(url, env);
      if (["GET", "HEAD"].includes(request.method) && !url.pathname.startsWith("/api/") && url.pathname !== "/api") {
        return await env.ASSETS.fetch(request);
      }
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
            if (next === null) return fail("timeout", "Body read timeout", 408);
            if (next.done) { complete = true; break; }
            size += next.value.byteLength;
            if (size > 16 * 1024) return fail("validation_error", "Body too large", 413);
            chunks.push(next.value);
          }
        } catch {
          return fail("validation_error", "Body read failed", 400);
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
      if (url.pathname.startsWith("/api/auth/")) {
        const auth = createAuth(env);
        const response = await auth.handler(request);
        if (response.status >= 500) return json({ error: "Local proof failure" }, 500);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const path = url.pathname;
      if (path !== "/api/session" && path !== "/api/account/new" && path !== "/api/account/claim"
        && path !== "/api/spots/save" && path !== "/api/private-notes" && !/^\/api\/private-notes\/[^/]+$/.test(path)) return json({ error: "Not found" }, 404);
      if (!["GET", "HEAD"].includes(request.method) && headers.get("Origin") !== base.origin) return fail("forbidden", "Invalid origin", 403);
      const session = await trustedAppSession(env, request.headers);
      if (session.state === "signedout") return fail("unauthorized", "Please sign in to continue.", 401, "Unauthorized");
      if (session.state === "unverified") return fail("forbidden", "Verify email", 403);
      // This is a stale-client guard, never an authentication credential.
      const expectedSession = request.headers.get("x-localley-session-id");
      if (!["GET", "HEAD"].includes(request.method) && expectedSession !== null && expectedSession !== session.sessionId) {
        return appError("session_changed", "Your session changed. Refresh before trying again.", 409);
      }
      if (path === "/api/session" && request.method === "GET") {
        return json(session);
      }
      let data: Record<string, unknown> = {};
      if (body?.length) {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("validation_error", "Invalid body", 400);
        data = parsed as Record<string, unknown>;
      }
      if (path === "/api/account/claim" && request.method === "POST") {
        if (Object.keys(data).length !== 1 || typeof data.token !== "string") return json({ error: "Invalid body" }, 400);
        return await redeemClaim(env, data.token, session.authUserId) ? json({ linked: true }) : json({ error: "Claim rejected" }, 409);
      }
      if (path === "/api/account/new" && request.method === "POST") {
        if (Object.keys(data).length) return json({ error: "Server-owned identity" }, 400);
        if (session.state === "incomplete") return json({ error: "Incomplete identity" }, 409);
        const ownerId = crypto.randomUUID();
        const userRecordId = crypto.randomUUID();
        const result = await env.DB.batch<{ ownerId: string; userRecordId: string | null }>([
          env.DB.prepare("INSERT INTO owners (id, source) SELECT ?, 'new' WHERE NOT EXISTS (SELECT 1 FROM identity_links WHERE authUserId = ?)").bind(ownerId, session.authUserId),
          env.DB.prepare("INSERT INTO profiles (id, ownerId) SELECT ?, ? WHERE changes() = 1").bind(userRecordId, ownerId),
          env.DB.prepare("INSERT INTO owner_limits (ownerId, savedSpotLimit) SELECT ?, 10 WHERE changes() = 1").bind(ownerId),
          env.DB.prepare("INSERT INTO identity_links (authUserId, ownerId) SELECT ?, ? WHERE changes() = 1").bind(session.authUserId, ownerId),
          env.DB.prepare("SELECT l.ownerId, p.id AS userRecordId FROM identity_links l LEFT JOIN profiles p ON p.ownerId = l.ownerId WHERE l.authUserId = ?").bind(session.authUserId),
        ]);
        const identity = result[4].results[0];
        return identity?.userRecordId ? json(identity, result[3].meta.changes === 1 ? 201 : 200) : json({ error: "Incomplete identity" }, 409);
      }
      if (session.state !== "ready") return fail("conflict", session.state === "incomplete" ? "Incomplete identity" : "Choose new account or claim legacy identity", 409);
      const ownerId = session.ownerId;
      if (path === "/api/spots/save") return await savedSpots(request, env, session, data);
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
      if (error instanceof SyntaxError) return fail("validation_error", "Invalid JSON", 400);
      // Do not log library exceptions: SQL parameters can contain credentials.
      return fail("internal_error", "An unexpected error occurred. Please try again.", 500, "Local proof failure");
    }
  },
} satisfies ExportedHandler<Env>;
