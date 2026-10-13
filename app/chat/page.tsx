import { headers } from "next/headers";
import SourceChatPage from "@/components/chat/source-chat-page";
import { PreviewChatHistory } from "@/components/chat/preview-chat-history";
import { previewChatHistoryPage, type PreviewChatHistoryState } from "@/lib/app-data/preview-chat-history-page";

export default async function ChatPage({ searchParams }: {
  searchParams: Promise<{ data_candidate?: string | string[]; conversation?: string | string[] }>;
}) {
  const params = await searchParams;
  const flag = Array.isArray(params.data_candidate) ? params.data_candidate[0] : params.data_candidate;
  if ((await headers()).get("host") !== "localley-next-preview.nkopp.workers.dev" || flag !== "d1")
    return <SourceChatPage />;
  let state: PreviewChatHistoryState = { kind: "unavailable" };
  if (process.env.AUTH_MAIL_MODE === "outbox" && process.env.SUPABASE_READ_ONLY === "true") {
    try { state = await previewChatHistoryPage(params.conversation); }
    catch { /* Candidate failures never load source history or disclose exception details. */ }
  }
  return <PreviewChatHistory state={state} />;
}
