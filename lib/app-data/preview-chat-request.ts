import "server-only";
import { currentUser } from "@/lib/auth/server";
import { chatSchema } from "@/lib/validations";
import { newOwnerId, ownerIds } from "./preview-conversations";

/** Bound the decoded chat request before validation, even without Content-Length. */
export async function readPreviewChatRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    const result = chatSchema.strict().safeParse(value);
    if (!result.success || !result.data.messages.some(message => message.role === "user")) return null;
    return result.data;
  } catch { return null; } finally { reader.releaseLock(); }
}

/** No historical identity or owner creation is allowed during this admission check. */
export async function admitFreshPreviewChatOwner(userId: string): Promise<void> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) {
    throw new Error("Candidate chat owner unavailable");
  }
  const ids = await ownerIds(userId);
  if (ids.legacy || (ids.fresh !== null && ids.fresh !== newOwnerId(userId))) {
    throw new Error("Candidate chat owner unavailable");
  }
}
