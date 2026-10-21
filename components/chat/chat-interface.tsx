"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Plus, Sparkles, X, Map, LayoutTemplate } from "@/components/ui/icons";
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
  /** Replaces the default "Ask Alley anything" label, e.g. with the /chat page header. */
  header?: ReactNode;
  /** Rendered between the header row and the messages, e.g. recent chats on /chat. */
  belowHeader?: ReactNode;
  itineraryContext?: ItineraryContext;
  selectedTemplate?: ItineraryTemplate;
  conversationId?: string;
}

// Helper to generate stable IDs
const generateMessageId = () => crypto.randomUUID();

export function ChatInterface({ className, header, belowHeader, itineraryContext, selectedTemplate, conversationId: initialConversationId }: ChatInterfaceProps) {
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
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const submissionPending = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);
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

  const isLoading = isLoadingHistory || isSavingConversation || sendChatMutation.isPending || reviseItineraryMutation.isPending;

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);


  const createNewConversation = () => {
    if (submissionPending.current) return;
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

  const saveMessage = async (role: string, content: string, destination?: string) => {
    let conversationId = destination || currentConversationId;
    if (!conversationId) {
      const conversation = await createConversationMutation.mutateAsync(content.substring(0, 50));
      conversationId = conversation.id;
      setCurrentConversationId(conversation.id);
    }
    await saveMessageMutation.mutateAsync({ conversationId, role, content });
    return conversationId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || submissionPending.current) return;
    submissionPending.current = true;
    setIsSavingConversation(true);
    const userMessage = input.trim();
    setInput("");
    setChatError(null);
    if (!activeItinerary) {
      const itineraryKeywords = /\b(itinerary|trip|plan|visit|travel|days?|week)\b/i;
      const cityMentioned = /\b(seoul|tokyo|bangkok|singapore|paris|london|new york)\b/i;
      if (itineraryKeywords.test(userMessage) || cityMentioned.test(userMessage)) setShowItineraryPrompt(true);
    }
    const userMessageObj: Message = { id: generateMessageId(), role: "user", content: userMessage };
    setMessages((prev) => [...prev, userMessageObj]);
    let userMessageSaved = false;
    try {
      // Pin this exchange to one persisted conversation before calling a model.
      const conversationId = await saveMessage("user", userMessage);
      userMessageSaved = true;
      let assistantMessage: string;
      if (activeItinerary) {
        await reviseItineraryMutation.mutateAsync({ id: activeItinerary.id, revisionRequest: userMessage });
        assistantMessage = `Great! I've updated "${activeItinerary.title}" based on your request. The changes have been saved. Would you like to make any other changes?`;
        toast({ title: "Itinerary updated!", description: "Your changes have been saved successfully." });
      } else {
        const apiMessages = [...messages, userMessageObj].map(({ role, content }) => ({ role, content }));
        const response = await sendChatMutation.mutateAsync({ messages: apiMessages, city: itineraryContext?.city });
        assistantMessage = response.message;
      }
      setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: assistantMessage }]);
      announce(`Alley says: ${assistantMessage.substring(0, 150)}`);
      try {
        await saveMessage("assistant", assistantMessage, conversationId);
      } catch {
        setChatError("Your reply is shown here, but chat history could not save it. Keep this page open.");
      }
    } catch {
      const message = userMessageSaved
        ? "Your message was saved, but Alley could not finish this reply."
        : "Your message could not be saved. Alley has not received it yet.";
      if (!userMessageSaved) {
        setMessages((prev) => prev.filter((item) => item.id !== userMessageObj.id));
        setInput(userMessage);
      }
      setChatError(message);
      announce(`Error: ${message}`);
      // Never retry a generation after an uncertain response.
      console.error("[chat] Submission failed", userMessageSaved ? "Reply failed" : "History save failed");
    } finally {
      submissionPending.current = false;
      setIsSavingConversation(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full min-h-0 overflow-hidden", className)} role="region" aria-label="Chat with Alley">
      {/* Live region for screen reader announcements */}
      <LiveRegionPortal />

      {/* Active Itinerary Context Banner */}
      {activeItinerary && (
        <Card className="mb-3 bg-surface flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
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
                disabled={isLoading}
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
        <Card className="mb-2 bg-surface flex-shrink-0">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                This chat generated a saved itinerary
              </span>
            </div>
            <Link href={`/itineraries/${linkedItineraryId}`}>
              <Button size="sm" variant="ghost" className="text-primary">
                View Itinerary
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Itinerary Suggestion Banner */}
      {showItineraryPrompt && !activeItinerary && (
        <Card className="mb-3 bg-surface flex-shrink-0 animate-in slide-in-from-top">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm mb-1">Want a full itinerary?</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Use our itinerary generator for a personalized day-by-day plan with hidden gems!
                  </p>
                  <Link href="/itineraries/new">
                    <Button size="sm" className="rounded-full">
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

      <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-3">
        {header ?? <h3 className="text-sm font-semibold text-muted-foreground">Ask Alley anything</h3>}
        <Button
          variant="secondary"
          size="sm"
          onClick={createNewConversation}
          disabled={isLoading}
          className="shrink-0 rounded-full"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>
      {belowHeader}

      {/* Messages container - Native overflow for proper flex constraints (replaces Radix ScrollArea) */}
      <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-1 py-2 mb-3">
        <div className="space-y-6">
          {isLoadingHistory && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
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
                      ? "bg-raised text-foreground"
                      : "bg-primary text-primary-foreground font-semibold"
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
                      "rounded-2xl px-4 py-3 text-[15px] leading-6",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground max-w-[80%]"
                        : "bg-surface text-foreground max-w-[85%]"
                    )}
                  >
                    <FormattedMessage content={message.content} role={message.role} conversationId={currentConversationId || undefined} />
                  </div>
                )}
              </div>
            );
          })}
          {isLoading && <ChatMessageSkeleton />}

          {/* Quick Action Buttons - Inside scroll area so they scroll with messages */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link href="/itineraries/new" className="flex-shrink-0">
              <Button
                size="sm"
                className="rounded-full gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate Itinerary
              </Button>
            </Link>
            <div className="flex flex-wrap gap-1.5">
              <Link href="/templates">
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full gap-1.5 whitespace-nowrap"
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Templates
                </Button>
              </Link>
              <Link href="/spots">
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full gap-1.5 whitespace-nowrap"
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
      <form onSubmit={handleSubmit} className="flex flex-shrink-0 items-end gap-2 rounded-2xl bg-surface p-2 shadow-surface" role="search">
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
          className="min-h-11 max-h-[120px] flex-1 resize-none rounded-xl bg-transparent py-2.5 text-[15px] shadow-none placeholder:text-muted-foreground"
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
          className="size-11 shrink-0 rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
