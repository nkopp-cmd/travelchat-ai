"use client";

import { useState } from "react";
import { History, ChevronDown, MessageCircle, Map } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/use-queries";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/api-client";

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface RecentConversationsPanelProps {
    currentConversationId?: string;
}

export function RecentConversationsPanel({ currentConversationId }: RecentConversationsPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { data: conversations, isLoading } = useConversations();
    const router = useRouter();

    const recentChats = (conversations as Conversation[] | undefined)?.slice(0, 8) || [];

    if (isLoading || recentChats.length === 0) return null;

    return (
        <div className="mb-3 flex-shrink-0 rounded-2xl bg-surface p-1">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full justify-between gap-1.5 rounded-xl px-3 text-[13px] text-muted-foreground"
            >
                <span className="flex items-center gap-1.5">
                    <History className="h-4 w-4" />
                    Recent chats
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
            </Button>

            {isOpen && (
                <div className="space-y-0.5 px-1 pb-1 animate-in slide-in-from-top-2 duration-200">
                    {recentChats.map((chat) => {
                        const isActive = chat.id === currentConversationId;
                        const lastMessage = chat.messages?.[chat.messages.length - 1];
                        const preview = lastMessage?.content?.substring(0, 50) || "";

                        return (
                            <button
                                key={chat.id}
                                onClick={() => {
                                    router.push(`/chat?conversation=${chat.id}`);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "flex min-h-11 w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-[15px] transition-colors",
                                    isActive
                                        ? "bg-raised text-foreground"
                                        : "text-muted-foreground hover:bg-raised hover:text-foreground"
                                )}
                            >
                                <MessageCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium">{chat.title || "New Chat"}</span>
                                        {chat.linked_itinerary_id && (
                                            <Map className="h-3 w-3 flex-shrink-0 text-primary" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {preview && (
                                            <span className="truncate text-[13px] text-muted-foreground">{preview}</span>
                                        )}
                                        <span className="ml-auto flex-shrink-0 text-[13px] text-muted-foreground">
                                            {formatRelativeTime(chat.updated_at)}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
