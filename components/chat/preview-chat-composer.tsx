"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreviewChatHistoryState } from "@/lib/app-data/preview-chat-history-page";

type History = Extract<PreviewChatHistoryState, { kind: "history" }>;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const base = "/chat?data_candidate=d1";

async function candidatePost(path: string, body: unknown, actorId: string) {
  const response = await fetch(`${path}?data_candidate=d1`, { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Localley-Preview-Actor": actorId }, body: JSON.stringify(body), signal: AbortSignal.timeout(70000) });
  if (!response.ok || response.headers.get("X-Localley-Data-Source") !== "d1-preview") throw new Error("Candidate request unavailable");
  return response.json();
}

/** One explicit paid action. Failures stay locked until a real page reload; never replay an uncertain call. */
export function PreviewChatComposer({ actorId, conversation }: { actorId: string; conversation: History["selected"] }) {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reloadTarget, setReloadTarget] = useState(conversation ? `${base}&conversation=${conversation.id}` : base);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const locked = useRef(false);
  const admitted = isLoaded && isSignedIn && user?.id === actorId;
  const history = (conversation?.messages ?? []).slice(-20).map(({ role, content }) => ({ role, content }));
  const historyFits = history.every(message => message.content.length <= 10000)
    && new TextEncoder().encode(JSON.stringify(history)).byteLength <= 40 * 1024;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (locked.current || !admitted || !historyFits || !content || content.length > 4000) return;
    locked.current = true; setPending(true); setError(null);
    let answer: string | null = null;
    try {
      // Refusal from the generation gate must not create a conversation or saved message.
      const generated = await candidatePost("/api/chat", { messages: [...history, { role: "user", content }] }, actorId);
      if (typeof generated.message !== "string" || !generated.message.trim() || generated.message.length > 10000)
        throw new Error("Invalid candidate reply");
      answer = generated.message; setReply(answer);
      let conversationId = conversation?.id;
      if (!conversationId) {
        const created = await candidatePost("/api/conversations", { title: content.slice(0, 120) }, actorId);
        conversationId = created.conversation?.id;
        if (typeof conversationId !== "string" || !uuid.test(conversationId)) throw new Error("Unknown conversation save");
      }
      setReloadTarget(`${base}&conversation=${conversationId}`);
      for (const message of [{ role: "user", content }, { role: "assistant", content: answer }]) {
        const saved = await candidatePost("/api/conversations/messages", { conversationId, ...message }, actorId);
        if (!saved.message || saved.message.conversation_id !== conversationId || saved.message.role !== message.role
          || saved.message.content !== message.content || typeof saved.message.id !== "string" || !uuid.test(saved.message.id))
          throw new Error("Unknown message save");
      }
      setSaved(true);
      router.replace(`${base}&conversation=${conversationId}`);
      router.refresh();
    } catch {
      setError(answer ? "Your reply arrived, but its saved history is not confirmed. Reload before sending again."
        : "Chat is unavailable or the reply is not confirmed. Reload before sending again.");
    } finally { setPending(false); }
  }

  if (!admitted) return <p role="status">Your account changed or is still loading. Reload to continue.</p>;
  return <form onSubmit={submit} aria-label="Message Alley" className="liquid-panel space-y-4 rounded-2xl p-5">
    <label htmlFor="preview-chat-question" className="block text-sm font-medium">Ask Alley</label>
    <Textarea id="preview-chat-question" value={question} maxLength={4000} placeholder="Which Seoul neighborhood should I explore?"
      onChange={event => setQuestion(event.target.value)} disabled={!admitted || pending || saved || Boolean(error)} className="min-h-24" />
    {!historyFits && <p role="status" className="text-sm">This conversation is too long to send another message here.</p>}
    {!admitted && <p role="status" className="text-sm">Your account changed or is still loading. Reload to continue.</p>}
    {reply && <section aria-label="Received reply" className="space-y-2"><h2 className="text-sm font-medium">Alley</h2><p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{reply}</p></section>}
    {error && <p role="alert" className="text-sm">{error} <a className="underline" href={reloadTarget}>Reload history</a></p>}
    {saved && <p role="status" className="text-sm">Your messages are saved. Refreshing history… <a className="underline" href={reloadTarget}>Reload history</a></p>}
    <Button type="submit" className="min-h-11" disabled={!admitted || !historyFits || !question.trim() || pending || saved || Boolean(error)}>
      {saved ? "Saved" : pending ? "Sending…" : "Send message"}
    </Button>
  </form>;
}
