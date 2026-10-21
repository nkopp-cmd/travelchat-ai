"use client";

import { ChatInterface } from "@/components/chat/chat-interface";
import { RecentConversationsPanel } from "@/components/chat/recent-conversations-panel";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppBackground } from "@/components/layout/app-background";
import { GradientText } from "@/components/ui/gradient-text";
import { MessageCircle } from "@/components/ui/icons";

// Use the same borderless header and safe-area navigation tokens as the shell.
const CHAT_VIEWPORT = "h-[calc(100dvh-var(--ll-topbar-height)-var(--ll-nav-clearance))] min-h-0";

function ChatPageContent() {
  const searchParams = useSearchParams();

  // Parse itinerary context from URL params if present
  const itineraryId = searchParams.get("itinerary");
  const itineraryTitle = searchParams.get("title");
  const itineraryCity = searchParams.get("city");
  const itineraryDays = searchParams.get("days");

  const itineraryContext = itineraryId && itineraryTitle && itineraryCity && itineraryDays
    ? {
        id: itineraryId,
        title: decodeURIComponent(itineraryTitle),
        city: decodeURIComponent(itineraryCity),
        days: parseInt(itineraryDays, 10),
      }
    : undefined;

  // Parse conversation ID for loading existing chat
  const conversationId = searchParams.get("conversation") || undefined;

  return (
    <AppBackground
      ambient
      fitParent
      className={CHAT_VIEWPORT}
      contentClassName="flex h-full min-h-0 flex-col"
    >
      {/* Same page width, header pattern and tokens as /spots (shared/plans/localley-design-consistency.md). */}
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 pb-3 pt-4 md:pt-8">
        <ChatInterface
          className="h-full"
          itineraryContext={itineraryContext}
          conversationId={conversationId}
          header={
            <div className="min-w-0">
              <div className="mb-2 hidden items-center gap-2 rounded-full bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-100 sm:inline-flex">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Your local guide
              </div>
              <h1 className="text-[22px] font-bold leading-tight tracking-tight md:text-3xl">
                <GradientText variant="violet">Chat with Alley</GradientText>
              </h1>
              <p className="mt-1 hidden text-[15px] text-muted-foreground sm:block">
                Ask for hidden spots, food and a day plan in any Asian city.
              </p>
            </div>
          }
          belowHeader={<RecentConversationsPanel currentConversationId={conversationId} />}
        />
      </div>
    </AppBackground>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div
        className={`flex ${CHAT_VIEWPORT} flex-col bg-background items-center justify-center`}
      >
        <div className="animate-pulse text-muted-foreground">Loading chat...</div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
