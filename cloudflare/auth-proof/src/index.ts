import { createAuth } from "./auth";
import { redeemClaim } from "./claim";
import { trustedAppSession } from "./app-session";
import { savedSpots } from "./saved-spots";
import { appError } from "./app-error";
import { catalog } from "./catalog";
import { emailPreferences } from "./email-preferences";
import { currentTrends } from "./current-trends";
import { itineraries, itineraryDetailPath, itineraryUpdatePath, itineraryDuplicatePath, itinerarySharePath, sharedItinerary, sharedItineraryPath, itineraryBodyLimit } from "./itineraries";
import { catalogChat } from "./chat";
import { allowedEmail, isPreview, trustedIP, validRuntime, type RuntimeEnv } from "./runtime";
import { verifyAccess, type AccessIdentity } from "./access";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const savedRoute = ["/api/spots/save", "/api/spots", "/api/user/email-preferences"].includes(new URL(request.url).pathname);
    const fail = (code: string, message: string, status: number, legacyMessage = message) =>
      savedRoute ? appError(code, message, status) : json({ error: legacyMessage }, status);
    try {
      const url = new URL(request.url);
      const itineraryRoute = url.pathname === "/api/itineraries" || url.pathname === "/api/itineraries/generate" || itineraryDetailPath.test(url.pathname) || itineraryUpdatePath.test(url.pathname) || itineraryDuplicatePath.test(url.pathname) || itinerarySharePath.test(url.pathname);
      const itineraryPatch = request.method === "PATCH" && itineraryUpdatePath.test(url.pathname);
      const itineraryCreate = request.method === "POST" && url.pathname === "/api/itineraries";
      const itineraryGenerate = request.method === "POST" && url.pathname === "/api/itineraries/generate";
      const itineraryDuplicate = request.method === "POST" && itineraryDuplicatePath.test(url.pathname);
      const itineraryShare = itinerarySharePath.test(url.pathname) && ["POST", "DELETE"].includes(request.method);
      const itineraryDelete = request.method === "DELETE" && itineraryDetailPath.test(url.pathname);
      const preferencesRoute = url.pathname === "/api/user/email-preferences";
      const chatRoute = url.pathname === "/api/chat";
      const base = new URL(env.AUTH_BASE_URL);
      if (!await validRuntime(request, env)) return fail("forbidden", "Runtime unavailable", 403);
      let access: AccessIdentity | undefined;
      if (isPreview(env)) {
        access = await verifyAccess(request, env) ?? undefined;
        if (!access) return fail("forbidden", "Access denied", 403);
        if (url.pathname === "/api/account/claim") return json({ error: "Not found" }, 404);
      }
      if (request.method === "GET" && url.pathname === "/api/app-config") return json(isPreview(env)
        ? { mode: "preview", catalogSource: "seoul-pilot", registration: "restricted-preview", emailDelivery: "cloudflare" }
        : { mode: "local", catalogSource: "synthetic", registration: "local-test", emailDelivery: "captured" });
      if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/health") return json({ ok: true });
      if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/trends/current") {
        const response = await currentTrends(request, env);
        return request.method === "HEAD" ? new Response(null, response) : response;
      }
      if ((request.method === "GET" || (isPreview(env) && request.method === "HEAD")) && url.pathname === "/api/spots") {
        const response = await catalog(url, env);
        return request.method === "HEAD" ? new Response(null, response) : response;
      }
      if (request.method === "GET" && sharedItineraryPath.test(url.pathname)) return await sharedItinerary(url, env);
      if (["GET", "HEAD"].includes(request.method) && !url.pathname.startsWith("/api/") && url.pathname !== "/api") {
        return await env.ASSETS.fetch(request);
      }
      // Cloudflare overwrites its IP header. Never accept the caller's internal header.
      const headers = new Headers(request.headers);
      const ip = trustedIP(request, env);
      if (!ip) return fail("forbidden", "Invalid client address", 403);
      headers.set("x-local-proof-ip", ip);
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
            if (size > (itineraryPatch || itineraryCreate ? itineraryBodyLimit : 16 * 1024)) return fail("validation_error", "Body too large", 413);
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
        const auth = createAuth(env, access);
        const response = await auth.handler(request);
        if (response.status >= 500) return json({ error: "Local proof failure" }, 500);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const path = url.pathname;
      if (path !== "/api/session" && path !== "/api/account/new" && path !== "/api/account/claim"
        && path !== "/api/spots/save" && path !== "/api/private-notes" && !/^\/api\/private-notes\/[^/]+$/.test(path) && !itineraryRoute && !preferencesRoute && !chatRoute) return json({ error: "Not found" }, 404);
      if (!["GET", "HEAD"].includes(request.method) && headers.get("Origin") !== base.origin) return fail("forbidden", "Invalid origin", 403);
      const session = await trustedAppSession(env, request.headers);
      if (session.state === "signedout") return fail("unauthorized", "Please sign in to continue.", 401, "Unauthorized");
      if (isPreview(env) && "authUserId" in session) {
        const user = await env.DB.prepare("SELECT email FROM user WHERE id = ?").bind(session.authUserId).first<{ email: string }>();
        const email = allowedEmail(env, user?.email);
        if (!email || (access?.kind === "human" && email !== access.email)) return fail("forbidden", "Session email mismatch", 403);
      }
      if (session.state === "unverified") return fail("forbidden", "Verify email", 403);
      // This is a stale-client guard, never an authentication credential.
      const expectedSession = request.headers.get("x-localley-session-id");
      const checksSession = !["GET", "HEAD"].includes(request.method) || itineraryRoute || path === "/api/spots/save" || preferencesRoute || path === "/api/session";
      // Refresh a stale account before the client interprets the new account's setup state.
      if (checksSession && expectedSession && expectedSession !== session.sessionId) {
        return appError("session_changed", "Your session changed. Refresh before trying again.", 409);
      }
      if (["/api/account/new", "/api/account/claim"].includes(path) && request.method === "POST" && !expectedSession) {
        return appError("session_required", "Refresh your session before trying again.", 428);
      }
      if ((path === "/api/spots/save" && ["POST", "DELETE"].includes(request.method)) || itineraryPatch || itineraryCreate || itineraryGenerate || itineraryDuplicate || itineraryShare || itineraryDelete || (preferencesRoute && request.method === "PUT") || (chatRoute && request.method === "POST")) {
        if (session.state !== "ready") return fail("conflict", session.state === "incomplete" ? "Incomplete identity" : "Choose new account or claim legacy identity", 409);
        if (!expectedSession) return appError("session_required", "Refresh your session before trying again.", 428);
      }
      if (checksSession && expectedSession === "") {
        return appError("session_changed", "Your session changed. Refresh before trying again.", 409);
      }
      if (path === "/api/session" && request.method === "GET") {
        return json(session);
      }
      let data: Record<string, unknown> = {};
      if ((itineraryDelete || itineraryDuplicate || itineraryShare) && body?.length) return json({ error: "Unexpected body" }, 400);
      if (body?.length) {
        let text: string;
        try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body); }
        catch { return fail("validation_error", "Invalid UTF-8", 400); }
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("validation_error", "Invalid body", 400);
        data = parsed as Record<string, unknown>;
      }
      if (path === "/api/account/claim" && request.method === "POST") {
        if (Object.keys(data).length !== 1 || typeof data.token !== "string") return json({ error: "Invalid body" }, 400);
        return await redeemClaim(env, data.token, session) ? json({ linked: true }) : json({ error: "Claim rejected" }, 409);
      }
      if (path === "/api/account/new" && request.method === "POST") {
        if (Object.keys(data).length) return json({ error: "Server-owned identity" }, 400);
        if (session.state === "incomplete") return json({ error: "Incomplete identity" }, 409);
        const ownerId = crypto.randomUUID();
        const userRecordId = crypto.randomUUID();
        // A ready-account retry may return its owner, but must not fork one after concurrent unlinking.
        const result = await env.DB.batch<{ ownerId: string; userRecordId: string | null }>([
          env.DB.prepare(`INSERT INTO owners (id, source) SELECT ?, 'new'
            WHERE ? = 1 AND NOT EXISTS (SELECT 1 FROM identity_links WHERE authUserId = ?)
            AND EXISTS (SELECT 1 FROM user u JOIN session s ON s.userId = u.id
              WHERE u.id = ? AND u.emailVerified = 1 AND s.id = ?
              AND s.expiresAt > CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER))`)
            .bind(ownerId, session.state === "unlinked" ? 1 : 0, session.authUserId, session.authUserId, session.sessionId),
          env.DB.prepare("INSERT INTO profiles (id, ownerId) SELECT ?, ? WHERE changes() = 1").bind(userRecordId, ownerId),
          env.DB.prepare("INSERT INTO owner_limits (ownerId, savedSpotLimit) SELECT ?, 10 WHERE changes() = 1").bind(ownerId),
          env.DB.prepare("INSERT INTO identity_links (authUserId, ownerId) SELECT ?, ? WHERE changes() = 1").bind(session.authUserId, ownerId),
          env.DB.prepare(`SELECT l.ownerId, p.id AS userRecordId FROM identity_links l
            LEFT JOIN profiles p ON p.ownerId = l.ownerId
            JOIN user u ON u.id = l.authUserId JOIN session s ON s.userId = u.id
            WHERE l.authUserId = ? AND u.emailVerified = 1 AND s.id = ?
            AND s.expiresAt > CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)`)
            .bind(session.authUserId, session.sessionId),
        ]);
        const identity = result[4].results[0];
        return identity?.userRecordId ? json(identity, result[3].meta.changes === 1 ? 201 : 200) : json({ error: "Incomplete identity" }, 409);
      }
      if (session.state !== "ready") return fail("conflict", session.state === "incomplete" ? "Incomplete identity" : "Choose new account or claim legacy identity", 409);
      const ownerId = session.ownerId;
      if (preferencesRoute) return await emailPreferences(request, env, session, data);
      if (chatRoute) return await catalogChat(request, env, session, data);
      if (itineraryRoute) return await itineraries(request, env, session, data);
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
} satisfies ExportedHandler<RuntimeEnv>;
