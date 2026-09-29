import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";

interface OwnerRow { id: string; source: string }
interface ConversationRow {
  id: string; title: string | null; created_at: string; updated_at: string | null;
  linked_itinerary_id: string | null;
}
interface MessageRow { id: string; conversation_id: string; role: string; content: string; created_at: string }

export function isPreviewConversationCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export function newOwnerId(userId: string): string {
  if (!userId || userId.length > 100) throw new Error("Invalid preview user ID");
  return `auth:${userId}`;
}

export async function ownerIds(userId: string): Promise<{ legacy: string | null; fresh: string | null }> {
  const results = await previewAppDataReader().prepare(`SELECT o.id, o.source FROM owners o
    LEFT JOIN legacy_owners l ON l.ownerId = o.id
    WHERE l.clerkUserId = ? OR (o.id = ? AND o.source = 'new' AND l.clerkUserId IS NULL) LIMIT 3`)
    .bind(userId, newOwnerId(userId)).all<OwnerRow>();
  if (!Array.isArray(results.results) || results.results.length > 2) throw new Error("Invalid preview owner mapping");
  let legacy: string | null = null;
  let fresh: string | null = null;
  for (const row of results.results) {
    if (typeof row.id !== "string") throw new Error("Invalid preview owner ID");
    if (row.id === newOwnerId(userId) && row.source !== "new") {
      throw new Error("Conflicting preview owner mapping");
    }
    if (row.id === newOwnerId(userId) && row.source === "new") fresh = row.id;
    else if (row.source === "legacy-fixture" && !legacy) legacy = row.id;
    else throw new Error("Conflicting preview owner mapping");
  }
  return { legacy, fresh };
}

export async function ensureOwnerId(userId: string): Promise<string> {
  const db = previewAppDataReader();
  let owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) {
    await db.prepare(`INSERT OR IGNORE INTO owners(id, source) SELECT ?, 'new'
      WHERE NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
      .bind(newOwnerId(userId), userId).run();
    owners = await ownerIds(userId);
  }
  const ownerId = owners.legacy ?? owners.fresh;
  if (!ownerId) throw new Error("Preview owner unavailable");
  return ownerId;
}

export async function previewConversations(userId: string): Promise<{ conversations: (ConversationRow & {
  messages: { id: string; role: string; content: string; created_at: string }[];
})[] }> {
  const db = previewAppDataReader();
  const owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) return { conversations: [] };
  const conversations = await db.prepare(`SELECT id, title, createdAt AS created_at,
    updatedAt AS updated_at, linkedItineraryId AS linked_itinerary_id
    FROM conversations WHERE ownerId IN (?, ?) ORDER BY updatedAt DESC, id DESC LIMIT 101`)
    .bind(owners.legacy ?? "", owners.fresh ?? "").all<ConversationRow>();
  if (!Array.isArray(conversations.results) || conversations.results.length > 100) {
    throw new Error("Preview conversation count exceeds limit");
  }
  if (!conversations.results.length) return { conversations: [] };
  const messages = await db.prepare(`SELECT m.id, m.conversationId AS conversation_id,
    m.role, m.content, m.createdAt AS created_at FROM messages m
    JOIN conversations c ON c.id = m.conversationId WHERE c.ownerId IN (?, ?)
    ORDER BY m.createdAt, m.id LIMIT 1001`)
    .bind(owners.legacy ?? "", owners.fresh ?? "").all<MessageRow>();
  if (!Array.isArray(messages.results) || messages.results.length > 1000) {
    throw new Error("Preview message count exceeds limit");
  }
  const byConversation = new Map<string, { id: string; role: string; content: string; created_at: string }[]>();
  for (const message of messages.results) {
    const list = byConversation.get(message.conversation_id) ?? [];
    list.push({ id: message.id, role: message.role, content: message.content, created_at: message.created_at });
    byConversation.set(message.conversation_id, list);
  }
  return { conversations: conversations.results.map(row => ({ ...row, messages: byConversation.get(row.id) ?? [] })) };
}

export async function createPreviewConversation(userId: string, title: unknown): Promise<{
  conversation: ConversationRow & { clerk_user_id: string };
}> {
  const name = title || "New Conversation";
  if (typeof name !== "string" || name.length > 200) throw new RangeError("Invalid conversation title");
  const db = previewAppDataReader();
  const ownerId = await ensureOwnerId(userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const result = await db.prepare(`INSERT INTO conversations
    (id, ownerId, title, linkedItineraryId, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)`)
    .bind(id, ownerId, name, now, now).run();
  if (result.meta.changes !== 1) throw new Error("Preview conversation write failed");
  return { conversation: { id, clerk_user_id: userId, title: name, linked_itinerary_id: null,
    created_at: now, updated_at: now } };
}

async function ownedConversation(userId: string, conversationId: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(conversationId)) return false;
  const owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) return false;
  const row = await previewAppDataReader().prepare(`SELECT id FROM conversations
    WHERE id = ? AND ownerId IN (?, ?)`)
    .bind(conversationId, owners.legacy ?? "", owners.fresh ?? "").first<{ id: string }>();
  return row?.id === conversationId;
}

export async function previewConversationMessages(userId: string, conversationId: string): Promise<{
  messages: { id: string; role: string; content: string; created_at: string }[];
} | null> {
  if (!(await ownedConversation(userId, conversationId))) return null;
  const { results } = await previewAppDataReader().prepare(`SELECT id, role, content,
    createdAt AS created_at FROM messages WHERE conversationId = ? ORDER BY createdAt, id LIMIT 1001`)
    .bind(conversationId).all<{ id: string; role: string; content: string; created_at: string }>();
  if (!Array.isArray(results) || results.length > 1000) throw new Error("Preview message count exceeds limit");
  return { messages: results };
}

export async function createPreviewConversationMessage(
  userId: string, conversationId: string, role: unknown, content: unknown,
): Promise<{ message: { id: string; conversation_id: string; role: string;
  content: string; created_at: string } } | null> {
  if (role !== "user" && role !== "assistant") throw new RangeError("Invalid message role");
  if (typeof content !== "string" || !content || Buffer.byteLength(content, "utf8") > 65536) {
    throw new RangeError("Invalid message content");
  }
  if (!(await ownedConversation(userId, conversationId))) return null;
  const owners = await ownerIds(userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const result = await previewAppDataReader().prepare(`INSERT INTO messages
    (id, conversationId, role, content, createdAt)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM conversations
      WHERE id = ? AND ownerId IN (?, ?))`)
    .bind(id, conversationId, role, content, now, conversationId,
      owners.legacy ?? "", owners.fresh ?? "").run();
  if (result.meta.changes === 0) return null;
  if (result.meta.changes !== 1) throw new Error("Preview message write failed");
  return { message: { id, conversation_id: conversationId, role, content, created_at: now } };
}

export async function linkPreviewConversation(
  userId: string, conversationId: string, itineraryId: unknown,
): Promise<boolean> {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  if (!uuid.test(conversationId)) return false;
  if (itineraryId !== null && (typeof itineraryId !== "string" || !uuid.test(itineraryId))) {
    throw new RangeError("Invalid linked itinerary ID");
  }
  const owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) return false;
  const result = await previewAppDataReader().prepare(`UPDATE conversations
    SET linkedItineraryId = ?, updatedAt = ?
    WHERE id = ? AND ownerId IN (?, ?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM itineraries i
        WHERE i.id = ? AND i.ownerId IN (?, ?)))`)
    .bind(itineraryId, new Date().toISOString(), conversationId,
      owners.legacy ?? "", owners.fresh ?? "", itineraryId, itineraryId,
      owners.legacy ?? "", owners.fresh ?? "").run();
  if (result.meta.changes > 1) throw new Error("Unexpected preview conversation update count");
  return result.meta.changes === 1;
}
