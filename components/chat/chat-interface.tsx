"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Plus, Sparkles, X, Map, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { FormattedMessage } from "./formatted-message";
import { ChatMessageSkeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useLiveAnnouncer } from "@/components/accessibility/live-region";
import { isItineraryContent } from "@/lib/chat-formatting";
import {
  useCreateConversation,
  useSaveMessage,
  useSendChatMessage,
  useReviseItinerary,
  useConversations,
  useMessages,
} from "@/hooks/use-queries";

interface Message {
  id: string; // Stable key for React
  role: "user" | "assistant";
  content: string;
}

interface ItineraryContext {
  id: string;
  title: string;
  city: string;
  days: number;
}

interface ItineraryTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  days: number;
  pace: string;
  prompt: string;
}

interface ChatInterfaceProps {
  className?: string;
  itineraryContext?: ItineraryContext;
  selectedTemplate?: ItineraryTemplate;
  conversationId?: string;
}

// Helper to generate stable IDs
const generateMessageId = () => crypto.randomUUID();

export function ChatInterface({ className, itineraryContext, selectedTemplate, conversationId: initialConversationId }: ChatInterfaceProps) {
  const getInitialMessage = () => {
    if (itineraryContext) {
      return `Hey! I can see you're working on "${itineraryContext.title}". What would you like to change? I can help you add activities, change the order, or adjust anything else!`;
    }
    if (selectedTemplate) {
      return `Great choice! You've selected the "${selectedTemplate.name}" template ${selectedTemplate.emoji}. This is perfect for a ${selectedTemplate.pace}-paced ${selectedTemplate.days}-day trip. Just tell me which city you'd like to explore, and I'll create a personalized itinerary for you!`;
    }
    return "Hey there! I'm Alley, your local guide. Looking for some hidden gems or tasty eats? Let me know what you're in the mood for!";
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: generateMessageId(),
      role: "assistant",
      content: getInitialMessage(),
    },
  ]);
  const [input, setInput] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(initialConversationId || null);
  const [showItineraryPrompt, setShowItineraryPrompt] = useState(false);
  const [activeItinerary, setActiveItinerary] = useState<ItineraryContext | undefined>(itineraryContext);
  const [chatError, setChatError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { announce, LiveRegionPortal } = useLiveAnnouncer();

  // React Query mutations
  const createConversationMutation = useCreateConversation();
  const saveMessageMutation = useSaveMessage();
  const sendChatMutation = useSendChatMessage();
  const reviseItineraryMutation = useReviseItinerary();

  // Load existing conversation history
  const { data: loadedMessages, isLoading: isLoadingHistory } = useMessages(
    initialConversationId || "",
    { enabled: !!initialConversationId }
  );

  // Fetch conversations to check for linked itinerary
  const { data: conversations } = useConversations();
  const currentConversation = conversations?.find((c: { id: string }) => c.id === currentConversationId);
  const linkedItineraryId = (currentConversation as { linked_itinerary_id?: string } | undefined)?.linked_itinerary_id;

  // Populate messages from DB when conversation loads
  useEffect(() => {
    if (initialConversationId && loadedMessages && loadedMessages.length > 0 && !historyLoaded) {
      setCurrentConversationId(initialConversationId);
      setMessages(
        loadedMessages.map((msg: { id?: string; role: string; content: string }) => ({
          id: msg.id || generateMessageId(),
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }))
      );
      setHistoryLoaded(true);
    }
  }, [initialConversationId, loadedMessages, historyLoaded]);

  const isLoading = sendChatMutation.isPending || reviseItineraryMutation.isPending;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


  const createNewConversation = () => {
    setCurrentConversationId(null);
    setChatError(null);
    setMessages([
      {
        id: generateMessageId(),
        role: "assistant",
        content: "Hey there! I'm Alley, your local guide. Looking for some hidden gems or tasty eats? Let me know what you're in the mood for!",
      },
    ]);
    setShowItineraryPrompt(false);
    toast({
      title: "New conversation started",
      description: "Ready to explore!",
    });
  };

  const saveMessage = async (role: string, content: string) => {
    if (!currentConversationId) {
      // Create new conversation first
      createConversationMutation.mutate(content.substring(0, 50), {
        onSuccess: (conversation) => {
          setCurrentConversationId(conversation.id);
          // Save the message to the new conversation
          saveMessageMutation.mutate({
            conversationId: conversation.id,
            role,
            content,
          });
        },
      });
    } else {
      // Save to existing conversation
      saveMessageMutation.mutate({
        conversationId: currentConversationId,
        role,
        content,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setChatError(null);

    // Check if user is asking for itinerary/trip planning (only if no active itinerary)
    if (!activeItinerary) {
      const itineraryKeywords = /\b(itinerary|trip|plan|visit|travel|days?|week)\b/i;
      const cityMentioned = /\b(seoul|tokyo|bangkok|singapore|paris|london|new york)\b/i;

      if (itineraryKeywords.test(userMessage) || cityMentioned.test(userMessage)) {
        setShowItineraryPrompt(true);
      }
    }

    // Add user message with stable ID
    const userMessageObj: Message = { id: generateMessageId(), role: "user", content: userMessage };
    setMessages((prev) => [...prev, userMessageObj]);

    // Save user message (fire and forget)
    saveMessage("user", userMessage);

    // If there's an active itinerary, use revision API
    if (activeItinerary) {
      reviseItineraryMutation.mutate(
        { id: activeItinerary.id, revisionRequest: userMessage },
        {
          onSuccess: () => {
            const assistantMessage = `Great! I've updated "${activeItinerary.title}" based on your request. The changes have been saved. Would you like to make any other changes?`;
            setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: assistantMessage }]);
            saveMessage("assistant", assistantMessage);
            announce(`Alley says: ${assistantMessage.substring(0, 150)}`);
            toast({
              title: "Itinerary updated!",
              description: "Your changes have been saved successfully.",
            });
          },
          onError: (error) => {
            const errorMessage = "Oops! I couldn't update the itinerary. Can you try again?";
            setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: errorMessage }]);
            setChatError(error.message || "Failed to update itinerary");
            announce(`Error: ${errorMessage}`);
          },
        }
      );
    } else {
      // Normal chat flow - prepare messages for API (without id field)
      const apiMessages = [...messages, userMessageObj].map(({ role, content }) => ({ role, content }));

      sendChatMutation.mutate(apiMessages, {
        onSuccess: (data) => {
          const assistantMessage = data.message;
          setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: assistantMessage }]);
          saveMessage("assistant", assistantMessage);
          announce(`Alley says: ${assistantMessage.substring(0, 150)}`);
        },
        onError: (error) => {
          const errorMessage = "Oops! I tripped over a cobblestone. Can you say that again?";
          setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: errorMessage }]);
          setChatError(error.message || "Failed to send message");
          announce(`Error: ${errorMessage}`);
        },
      });
    }
  };

  return (
    <div className={cn("flex flex-col h-full min-h-0 overflow-hidden", className)} role="region" aria-label="Chat with Alley">
      {/* Live region for screen reader announcements */}
      <LiveRegionPortal />

      {/* Active Itinerary Context Banner */}
      {activeItinerary && (
        <Card className="mb-4 border-violet-200/50 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Sparkles className="h-5 w-5 text-violet-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm mb-1">Editing: {activeItinerary.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    {activeItinerary.city} • {activeItinerary.days} {activeItinerary.days === 1 ? 'day' : 'days'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveItinerary(undefined);
                  createNewConversation();
                }}
                className="flex-shrink-0"
                aria-label="Stop editing itinerary and start new chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Itinerary Badge */}
      {linkedItineraryId && !activeItinerary && (
        <Card className="mb-2 border-violet-200/50 bg-violet-500/5 flex-shrink-0">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-violet-600" />
              <span className="text-sm text-muted-foreground">
                This chat generated a saved itinerary
              </span>
            </div>
            <Link href={`/itineraries/${linkedItineraryId}`}>
              <Button size="sm" variant="ghost" className="text-violet-600 hover:text-violet-700">
                View Itinerary
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Itinerary Suggestion Banner */}
      {showItineraryPrompt && !activeItinerary && (
        <Card className="mb-4 border-violet-200/50 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 flex-shrink-0 animate-in slide-in-from-top">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Sparkles className="h-5 w-5 text-violet-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm mb-1">Want a full itinerary?</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Use our itinerary generator for a personalized day-by-day plan with hidden gems!
                  </p>
                  <Link href="/itineraries/new">
                    <Button size="sm" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                      <Sparkles className="mr-2 h-3 w-3" />
                      Generate Itinerary
                    </Button>
                  </Link>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowItineraryPrompt(false)}
                className="flex-shrink-0"
                aria-label="Dismiss itinerary suggestion"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between mb-2 px-2 flex-shrink-0">
        <h3 className="text-sm font-semibold text-muted-foreground">Ask Alley anything</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={createNewConversation}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Messages container - Native overflow for proper flex constraints (replaces Radix ScrollArea) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-md shadow-sm mb-3">
        <div className="space-y-6">
          {isLoadingHistory && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span className="h-4 w-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                Loading conversation...
              </div>
            </div>
          )}
          {messages.map((message) => {
            const isItinerary = message.role === "assistant" && isItineraryContent(message.content);

            return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={cn(
                    message.role === "user"
                      ? "bg-violet-500 text-white"
                      : "bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
                  )}>
                    {message.role === "user" ? "U" : "A"}
                  </AvatarFallback>
                </Avatar>
                {isItinerary ? (
                  <div className="flex-1 min-w-0">
                    <FormattedMessage content={message.content} role={message.role} conversationId={currentConversationId || undefined} />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "rounded-2xl px-5 py-4 shadow-sm",
                      message.role === "user"
                        ? "bg-violet-500 text-white max-w-[75%]"
                        : "bg-muted/50 text-foreground border border-border/40 max-w-[85%]"
                    )}
                  >
                    <FormattedMessage content={message.content} role={message.role} conversationId={currentConversationId || undefined} />
                  </div>
                )}
              </div>
            );
          })}
          {isLoading && <ChatMessageSkeleton />}
          <div ref={scrollRef} />

          {/* Quick Action Buttons - Inside scroll area so they scroll with messages */}
          <div className="flex items-center gap-2 pt-2">
            <Link href="/itineraries/new" className="flex-shrink-0">
              <Button
                size="sm"
                className="rounded-full text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-md shadow-violet-500/20 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate Itinerary
              </Button>
            </Link>
            <div className="flex gap-1.5 overflow-x-auto">
              <Link href="/templates">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs gap-1.5 text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Templates
                </Button>
              </Link>
              <Link href="/spots">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs gap-1.5 text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  <Map className="h-3.5 w-3.5" />
                  Spots
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Error display region */}
      {chatError && (
        <div role="alert" className="mb-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm flex-shrink-0">
          {chatError}
        </div>
      )}

      {/* INPUT ANCHOR - Always visible at bottom */}
      <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0 pt-2 pb-0" role="search">
        <label htmlFor="chat-input" className="sr-only">
          Message to Alley
        </label>
        <Textarea
          id="chat-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Submit on Enter (without Shift), allow Shift+Enter for new line
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Ask Alley..."
          disabled={isLoading}
          rows={1}
          aria-describedby={chatError ? "chat-error" : isLoading ? "chat-loading" : undefined}
          aria-invalid={!!chatError}
          className="flex-1 rounded-2xl border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-md focus-visible:ring-violet-500 min-h-[40px] max-h-[120px] resize-none py-2.5"
        />
        {isLoading && (
          <span id="chat-loading" className="sr-only">
            Alley is typing a response
          </span>
        )}
        {chatError && (
          <span id="chat-error" className="sr-only">
            {chatError}
          </span>
        )}
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !input.trim()}
          aria-label="Send message"
          className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
