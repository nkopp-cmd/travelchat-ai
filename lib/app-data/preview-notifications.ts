import "server-only";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import type { Notification, NotificationType } from "@/types";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

const types: NotificationType[] = ["achievement", "level_up", "new_spot", "itinerary_shared",
  "itinerary_liked", "review_helpful", "friend_request", "friend_accepted", "challenge_start",
  "challenge_ending", "weekly_digest", "system"];
interface Row { id: string; type: string; title: string; message: string; data: string;
  isRead: number; readAt: string | null; createdAt: string }

export function isPreviewNotificationCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Real accounts have unimported history, so only verified isolated accounts can use this inbox. */
export async function assertPreviewNotificationUser(userId: string): Promise<void> {
  const user = await currentUser();
  if (user?.id !== userId || !user.emailVerified
    || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) {
    throw new Error("Historical notifications unavailable");
  }
  const owners = await ownerIds(userId);
  if (owners.legacy) throw new Error("Historical notifications unavailable");
}

export function parsePreviewNotificationPage(request: NextRequest): { limit: number; offset: number; unreadOnly: boolean } | null {
  const params = request.nextUrl.searchParams;
  const rawLimit = params.get("limit") ?? "20";
  const rawOffset = params.get("offset") ?? "0";
  const rawUnread = params.get("unreadOnly") ?? "false";
  if (!/^[1-9][0-9]*$/.test(rawLimit) || !/^(0|[1-9][0-9]*)$/.test(rawOffset)
    || !["true", "false"].includes(rawUnread)) return null;
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(limit) || limit > 50 || !Number.isSafeInteger(offset) || offset > 1000) return null;
  return { limit, offset, unreadOnly: rawUnread === "true" };
}

function notification(row: Row, userId: string): Notification {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id)
    || !types.includes(row.type as NotificationType)
    || typeof row.title !== "string" || !row.title || row.title.length > 200
    || typeof row.message !== "string" || !row.message || row.message.length > 2000
    || ![0, 1].includes(row.isRead) || typeof row.createdAt !== "string"
    || !Number.isFinite(Date.parse(row.createdAt))
    || (row.readAt !== null && (typeof row.readAt !== "string" || !Number.isFinite(Date.parse(row.readAt))))) {
    throw new Error("Invalid preview notification");
  }
  const data = JSON.parse(row.data) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid preview notification data");
  return { id: row.id, clerkUserId: userId, type: row.type as NotificationType,
    title: row.title, message: row.message, data: data as Notification["data"],
    read: row.isRead === 1, readAt: row.readAt ?? undefined, createdAt: row.createdAt };
}

export async function previewNotifications(userId: string, page: { limit: number; offset: number; unreadOnly: boolean }) {
  const ownerId = newOwnerId(userId);
  const db = previewAppDataReader();
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT n.id, n.type, n.title, n.message, n.data, n.isRead, n.readAt, n.createdAt
      FROM preview_notifications n JOIN owners o ON o.id = n.ownerId AND o.source = 'new'
      WHERE n.ownerId = ? AND (? = 0 OR n.isRead = 0)
      ORDER BY n.createdAt DESC, n.id DESC LIMIT ? OFFSET ?`)
      .bind(ownerId, Number(page.unreadOnly), page.limit + 1, page.offset).all<Row>(),
    db.prepare(`SELECT count(*) AS n FROM preview_notifications n
      JOIN owners o ON o.id = n.ownerId AND o.source = 'new'
      WHERE n.ownerId = ? AND n.isRead = 0`).bind(ownerId).first<{ n: number }>(),
  ]);
  if (!Array.isArray(rows.results) || rows.results.length > page.limit + 1
    || !count || !Number.isSafeInteger(count.n) || count.n < 0) throw new Error("Preview notifications unavailable");
  return { notifications: rows.results.slice(0, page.limit).map(row => notification(row, userId)), unreadCount: count.n };
}

export async function markAllPreviewNotificationsRead(userId: string): Promise<boolean> {
  const ownerId = newOwnerId(userId);
  await previewAppDataReader().prepare(`UPDATE preview_notifications SET isRead = 1, readAt = ?
    WHERE ownerId = ? AND isRead = 0 AND EXISTS
      (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(new Date().toISOString(), ownerId, ownerId).run();
  return true;
}

export function isPreviewNotificationId(id: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
}

export async function markPreviewNotificationRead(userId: string, id: string): Promise<boolean> {
  const ownerId = newOwnerId(userId);
  await previewAppDataReader().prepare(`UPDATE preview_notifications SET isRead = 1, readAt = ?
    WHERE ownerId = ? AND id = ? AND isRead = 0 AND EXISTS
      (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(new Date().toISOString(), ownerId, id, ownerId).run();
  return true;
}

export async function deletePreviewNotification(userId: string, id: string): Promise<boolean> {
  const ownerId = newOwnerId(userId);
  await previewAppDataReader().prepare(`DELETE FROM preview_notifications
    WHERE ownerId = ? AND id = ? AND EXISTS
      (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(ownerId, id, ownerId).run();
  return true;
}
