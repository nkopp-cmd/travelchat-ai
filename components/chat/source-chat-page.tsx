"use client";

import { ChatInterface } from "@/components/chat/chat-interface";
import { RecentConversationsPanel } from "@/components/chat/recent-conversations-panel";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppBackground } from "@/components/layout/app-background";

// Header:56px+1px; mobile navigation:64px+1px+safe area.
const CHAT_VIEWPORT = "h-[calc(100dvh-7.5rem-2px-env(safe-area-inset-bottom,0px))] min-h-0 md:h-[calc(100dvh-4rem-1px)]";

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
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.035] flex-shrink-0 backdrop-blur-xl">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
          <span className="text-white font-bold">A</span>
        </div>
        <div className="flex-1">
          <h1 className="font-semibold">Alley</h1>
          <p className="text-xs text-muted-foreground">Your local guide</p>
        </div>
      </div>

      {/* Recent Conversations Panel (mobile-friendly) */}
      <RecentConversationsPanel currentConversationId={conversationId} />

      {/* Chat Content - Takes remaining space */}
      <div className="flex-1 min-h-0 px-3 py-2 sm:px-4">
        <ChatInterface
          className="h-full"
          itineraryContext={itineraryContext}
          conversationId={conversationId}
        />
      </div>
    </AppBackground>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div
        className={`flex ${CHAT_VIEWPORT} flex-col bg-[#0b0714] items-center justify-center`}
      >
        <div className="animate-pulse text-muted-foreground">Loading chat...</div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
