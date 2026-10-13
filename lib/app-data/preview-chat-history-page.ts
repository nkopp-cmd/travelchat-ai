import "server-only";
import { currentUser } from "@/lib/auth/server";
import { admitFreshPreviewChatOwner } from "./preview-chat-request";
import { previewConversations } from "./preview-conversations";

export type PreviewChatHistoryState =
  | { kind: "unavailable" }
  | { kind: "history"; actorId: string; canSend: boolean; conversations: { id: string; title: string }[]; selected: null | {
    id: string; title: string; messages: { id: string; role: "user" | "assistant"; content: string }[];
  } };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Bounded, read-only fresh-owner history. No owner rows, paid calls or source fallbacks. */
export async function previewChatHistoryPage(conversation?: string | string[]): Promise<PreviewChatHistoryState> {
  if (conversation !== undefined && (typeof conversation !== "string" || !uuid.test(conversation)))
    throw new Error("Preview chat unavailable");
  const user = await currentUser();
  if (!user) throw new Error("Preview chat unavailable");
  await admitFreshPreviewChatOwner(user.id);
  const { conversations } = await previewConversations(user.id);
  if (conversations.some(row => !uuid.test(row.id) || (row.title !== null &&
    (typeof row.title !== "string" || row.title.length > 200)))) throw new Error("Preview chat unavailable");
  const selected = conversation ? conversations.find(row => row.id === conversation) : conversations[0];
  if (conversation && !selected) throw new Error("Preview chat unavailable");
  if (selected?.messages.some(message => !uuid.test(message.id)
    || (message.role !== "user" && message.role !== "assistant")
    || typeof message.content !== "string" || !message.content || Buffer.byteLength(message.content, "utf8") > 65536))
    throw new Error("Preview chat unavailable");
  return { kind: "history", actorId: user.id, canSend: process.env.PREVIEW_CHAT_GENERATION === "true",
    conversations: conversations.map(row => ({ id: row.id, title: row.title || "Untitled conversation" })),
    selected: selected ? { id: selected.id, title: selected.title || "Untitled conversation",
      messages: selected.messages.map(message => ({ id: message.id, role: message.role as "user" | "assistant", content: message.content })) } : null };
}
