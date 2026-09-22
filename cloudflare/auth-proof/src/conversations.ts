import type { TrustedAppSession } from "./app-session";

// Read-only chat history for the signed-in owner. Imported legacy conversations appear here
// once an account claims its legacy owner; nothing is shared across owners.
export const conversationsPath = /^\/api\/conversations$/;
export const conversationMessagesPath = /^\/api\/conversations\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/messages$/;
export const conversationListLimit = 50;
export const conversationMessageLimit = 500;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function conversations(request: Request, env: Env, session: TrustedAppSession): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (url.search) return json({ error: "Unexpected query" }, 400);
  const match = conversationMessagesPath.exec(url.pathname);
  if (!match) {
    const rows = (await env.DB.prepare(`SELECT id, title, linkedItineraryId, createdAt, updatedAt FROM conversations
      WHERE ownerId = ? ORDER BY COALESCE(updatedAt, createdAt) DESC, id LIMIT ?`).bind(session.ownerId, conversationListLimit + 1)
      .all<{ id: string; title: string | null; linkedItineraryId: string | null; createdAt: string; updatedAt: string | null }>()).results;
    return json({ conversations: rows.slice(0, conversationListLimit), truncated: rows.length > conversationListLimit });
  }
  const [owned, messages] = await env.DB.batch<{ id: string; role?: string; content?: string; createdAt?: string; title?: string | null }>([
    env.DB.prepare("SELECT id, title FROM conversations WHERE id = ? AND ownerId = ?").bind(match[1], session.ownerId),
    env.DB.prepare(`SELECT m.id, m.role, m.content, m.createdAt FROM messages m JOIN conversations c ON c.id = m.conversationId
      WHERE m.conversationId = ? AND c.ownerId = ? ORDER BY m.createdAt, m.id LIMIT ?`).bind(match[1], session.ownerId, conversationMessageLimit + 1),
  ]);
  const conversation = owned.results[0];
  // Another owner's conversation is indistinguishable from a missing one.
  if (!conversation) return json({ error: "Not found" }, 404);
  return json({ conversation: { id: conversation.id, title: conversation.title ?? null },
    messages: messages.results.slice(0, conversationMessageLimit), truncated: messages.results.length > conversationMessageLimit });
}
