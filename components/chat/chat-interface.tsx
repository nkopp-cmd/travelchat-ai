"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { FormattedMessage } from "./formatted-message";
import { ChatMessageSkeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

interface Message {
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
}

export function ChatInterface({ className, itineraryContext, selectedTemplate }: ChatInterfaceProps) {
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
      role: "assistant",
      content: getInitialMessage(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showItineraryPrompt, setShowItineraryPrompt] = useState(false);
  const [activeItinerary, setActiveItinerary] = useState<ItineraryContext | undefined>(itineraryContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


  const createNewConversation = async () => {
    setCurrentConversationId(null);
    setMessages([
      {
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
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: content.substring(0, 50) }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(data.conversation.id);

        await fetch("/api/conversations/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: data.conversation.id,
            role,
            content,
          }),
        });
      }
    } else {
      await fetch("/api/conversations/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: currentConversationId,
          role,
          content,
        }),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");

    // Check if user is asking for itinerary/trip planning (only if no active itinerary)
    if (!activeItinerary) {
      const itineraryKeywords = /\b(itinerary|trip|plan|visit|travel|days?|week)\b/i;
      const cityMentioned = /\b(seoul|tokyo|bangkok|singapore|paris|london|new york)\b/i;

      if (itineraryKeywords.test(userMessage) || cityMentioned.test(userMessage)) {
        setShowItineraryPrompt(true);
      }
    }

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    await saveMessage("user", userMessage);

    try {
      // If there's an active itinerary, use revision API
      if (activeItinerary) {
        const response = await fetch(`/api/itineraries/${activeItinerary.id}/revise`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            revisionRequest: userMessage,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to revise itinerary");
        }

        const data = await response.json();
        const assistantMessage = `Great! I've updated "${activeItinerary.title}" based on your request. The changes have been saved. Would you like to make any other changes?`;

        setMessages((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        await saveMessage("assistant", assistantMessage);

        toast({
          title: "Itinerary updated!",
          description: "Your changes have been saved successfully.",
        });
      } else {
        // Normal chat flow
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [...messages, { role: "user", content: userMessage }],
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch response");
        }

        const data = await response.json();
        const assistantMessage = data.message;

        setMessages((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        await saveMessage("assistant", assistantMessage);
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage = "Oops! I tripped over a cobblestone. Can you say that again?";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMessage },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
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
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
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

      <ScrollArea className="flex-1 min-h-0 p-4 rounded-2xl border border-border/40 bg-background/60 backdrop-blur-sm shadow-sm mb-4">
        <div className="space-y-6 pb-4">
          {messages.map((message, index) => (
            <div
              key={index}
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
              <div
                className={cn(
                  "rounded-2xl px-5 py-4 shadow-sm",
                  message.role === "user"
                    ? "bg-violet-500 text-white max-w-[75%]"
                    : "bg-muted/50 text-foreground border border-border/40 max-w-[85%]"
                )}
              >
                <FormattedMessage content={message.content} role={message.role} />
              </div>
            </div>
          ))}
          {isLoading && <ChatMessageSkeleton />}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Alley..."
          disabled={isLoading}
          className="flex-1 rounded-full border-border/40 bg-background/60 backdrop-blur-sm focus-visible:ring-violet-500"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !input.trim()}
          className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
