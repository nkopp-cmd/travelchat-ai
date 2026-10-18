import Link from "next/link";
import { MessageCircle, RefreshCw } from "@/components/ui/icons";
import { AppBackground } from "@/components/layout/app-background";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PreviewChatHistoryState } from "@/lib/app-data/preview-chat-history-page";
import { PreviewChatComposer } from "./preview-chat-composer";

const base = "/chat?data_candidate=d1";
export function PreviewChatHistory({ state }: { state: PreviewChatHistoryState }) {
  const selected = state.kind === "history" ? state.selected : null;
  return <AppBackground ambient className="min-h-screen">
    <section aria-label="Saved chat preview" className="mx-auto max-w-5xl space-y-6 px-4 pb-28 pt-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><Badge className="mb-3">Chat preview</Badge><h1 className="text-3xl font-bold tracking-tight">Alley</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your saved conversations with your local guide.</p></div>
        <a className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
          href={selected ? `${base}&conversation=${selected.id}` : base}><RefreshCw className="h-4 w-4" /> Reload history</a>
      </header>
      <p className="text-sm text-muted-foreground">{state.kind === "history" && state.canSend
        ? "Ask Alley about your next stop. Your messages will be saved here."
        : "Saved history only. Sending new messages is unavailable in this preview."}</p>
      {state.kind === "unavailable" ? <Card className="liquid-panel"><CardContent className="pt-6"><p role="status">Chat history is unavailable for this account or conversation.</p></CardContent></Card>
        : <div className="grid min-w-0 gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
          <Card className="liquid-panel min-w-0"><CardHeader><CardTitle className="text-lg">Conversations</CardTitle></CardHeader>
            <CardContent>{!state.conversations.length ? <p role="status" className="text-sm text-muted-foreground">You have no saved preview conversations.</p>
              : <nav aria-label="Saved conversations" className="space-y-2">{state.conversations.map(row => <Link key={row.id} href={`${base}&conversation=${row.id}`}
                aria-current={selected?.id === row.id ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-xl p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 ${selected?.id === row.id ? "bg-violet-500/15 text-violet-200" : "hover:bg-white/5"}`}>
                <MessageCircle aria-hidden className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{row.title}</span></Link>)}</nav>}</CardContent></Card>
          <Card className="liquid-panel min-w-0"><CardHeader><CardTitle className="break-words text-lg [overflow-wrap:anywhere]">{selected?.title || "Saved messages"}</CardTitle></CardHeader>
            <CardContent>{!selected ? <p className="text-sm text-muted-foreground">Saved conversations will appear here.</p>
              : !selected.messages.length ? <p role="status">This conversation has no saved messages.</p>
                : <ol aria-label="Saved messages" className="space-y-4">{selected.messages.map(message => <li key={message.id}
                  className={`rounded-2xl p-4 ${message.role === "user" ? "ml-3 bg-violet-500/10 sm:ml-8" : "mr-3 bg-white/[0.035] sm:mr-8"}`}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : "Alley"}</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.content}</p>
                </li>)}</ol>}</CardContent></Card>
        </div>}
      {state.kind === "history" && state.canSend && <PreviewChatComposer
        key={`${state.actorId}:${state.selected?.id ?? "new"}:${state.selected?.messages.length ?? 0}`}
        actorId={state.actorId} conversation={state.selected} />}
    </section>
  </AppBackground>;
}
