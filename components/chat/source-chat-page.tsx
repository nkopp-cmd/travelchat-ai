"use client";

import { ChatInterface } from "@/components/chat/chat-interface";
import { RecentConversationsPanel } from "@/components/chat/recent-conversations-panel";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppBackground } from "@/components/layout/app-background";

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
      className="h-full"
      contentClassName="flex flex-col"
      style={{ height: 'calc(100dvh - 64px - env(safe-area-inset-bottom, 0px))' }}
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
        className="flex flex-col bg-[#0b0714] items-center justify-center"
        style={{ height: 'calc(100dvh - 64px - env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="animate-pulse text-muted-foreground">Loading chat...</div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
