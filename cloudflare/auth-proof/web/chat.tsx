import { FormEvent, useState } from "react";
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
  </section>;
}
