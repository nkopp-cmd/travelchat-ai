import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "./session";

export function NativeChat({ sessionId, onSignIn }: { sessionId: string; onSignIn: () => void }) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !message.trim()) return;
    setBusy(true);
    setError("");
    setReply("");
    try {
      const value = await api<{ reply: string }>("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-localley-session-id": sessionId },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (typeof value.reply !== "string") throw new Error("Chat failed.");
      setReply(value.reply);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 428)) {
        onSignIn();
        return;
      }
      setError("Could not answer from the catalog. Try a published place name.");
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Catalog chat">
    <h2>Ask the catalog</h2>
    <p className="intro">Answers use GPT-5.6 Luna with published catalog places. If Luna is unavailable, the catalog facts still answer.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label>Question<input value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={2000} disabled={busy} /></label>
      <Button type="submit" disabled={busy || !message.trim()}>{busy ? "Checking catalog..." : "Ask"}</Button>
    </form>
    {reply && <p role="status">{reply}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <ConversationHistory sessionId={sessionId} />
  </section>;
}

type Conversation = { id: string; title: string | null; createdAt: string; updatedAt: string | null };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
// Read-only history. Imported conversations appear after an account claims its legacy owner.
function ConversationHistory({ sessionId }: { sessionId: string }) {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<{ id: string; messages: Message[] | null; failed?: boolean } | null>(null);
  const headers = { "x-localley-session-id": sessionId };
  useEffect(() => {
    let active = true;
    setList(null); setFailed(false); setOpen(null);
    api<{ conversations: Conversation[] }>("/api/conversations", { headers: { "x-localley-session-id": sessionId } })
      .then((value) => { if (active) setList(Array.isArray(value.conversations) ? value.conversations : []); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [sessionId]);
  async function show(id: string) {
    setOpen({ id, messages: null });
    try {
      const value = await api<{ messages: Message[] }>(`/api/conversations/${encodeURIComponent(id)}/messages`, { headers });
      setOpen((current) => current?.id === id ? { id, messages: Array.isArray(value.messages) ? value.messages : [] } : current);
    } catch { setOpen((current) => current?.id === id ? { id, messages: null, failed: true } : current); }
  }
  return <section className="conversation-history" aria-label="Past conversations">
    <h3>Past conversations</h3>
    {failed && <p className="error" role="alert">Past conversations could not load.</p>}
    {!failed && list === null && <p role="status">Loading past conversations...</p>}
    {list?.length === 0 && <p className="empty">No past conversations. Chats from the current Localley site appear here after your account moves.</p>}
    {!!list?.length && <ul>{list.map((conversation) => <li key={conversation.id}>
      <button className="secondary" aria-expanded={open?.id === conversation.id} onClick={() => void show(conversation.id)}>{conversation.title?.trim() || "Untitled conversation"} · {new Date(conversation.updatedAt ?? conversation.createdAt).toLocaleDateString()}</button>
      {open?.id === conversation.id && (open.failed ? <p className="error" role="alert">Messages could not load.</p> : open.messages === null ? <p role="status">Loading messages...</p>
        : <ol className="conversation-messages">{open.messages.map((message) => <li key={message.id} data-role={message.role}><strong>{message.role === "user" ? "You" : "Localley"}</strong><p>{message.content}</p></li>)}</ol>)}
    </li>)}</ul>}
  </section>;
}
