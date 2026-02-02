"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInterface } from "./chat-interface";

interface MobileChatFABProps {
  itineraryContext?: {
    id: string;
    title: string;
    city: string;
    days: number;
  };
  selectedTemplate?: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    days: number;
    pace: string;
    prompt: string;
  };
}

export function MobileChatFAB({ itineraryContext, selectedTemplate }: MobileChatFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Hide FAB when scrolling down, show when scrolling up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsVisible(currentScrollY < lastScrollY || currentScrollY < 100);
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Prevent body scroll when chat is open (use touch-action for better mobile support)
  useEffect(() => {
    if (isOpen) {
      document.body.style.touchAction = "none";
      document.body.style.overscrollBehavior = "none";
    } else {
      document.body.style.touchAction = "";
      document.body.style.overscrollBehavior = "";
    }
    return () => {
      document.body.style.touchAction = "";
      document.body.style.overscrollBehavior = "";
    };
  }, [isOpen]);

  // Handle viewport resize when mobile keyboard opens
  useEffect(() => {
    if (!isOpen) return;

    const handleViewportResize = () => {
      const input = document.getElementById('chat-input');
      if (input && document.activeElement === input) {
        setTimeout(() => {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    };

    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleViewportResize);
      return () => {
        visualViewport.removeEventListener('resize', handleViewportResize);
      };
    }
  }, [isOpen]);

  // Show notification dot after a delay (to indicate Alley is ready)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) {
        setHasUnread(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setHasUnread(false);
    // Focus input after animation completes
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) {
        input.focus();
      }
    }, 350);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Action Button - Only visible on mobile/tablet */}
      <Button
        onClick={handleOpen}
        className={cn(
          "fixed bottom-24 right-6 z-40 h-14 w-14 rounded-full shadow-lg shadow-violet-500/30",
          "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700",
          "transition-all duration-300 lg:hidden",
          isOpen && "scale-0 opacity-0",
          !isVisible && !isOpen && "translate-y-24 opacity-0"
        )}
        size="icon"
        aria-label="Open chat with Alley"
      >
        <MessageCircle className="h-6 w-6" />
        {/* Notification dot */}
        {hasUnread && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-white animate-pulse" />
        )}
        {/* Pulse animation ring */}
        <span className="absolute inset-0 rounded-full bg-violet-500 animate-ping opacity-20" />
      </Button>

      {/* Bottom Sheet Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={handleClose}
        />
      )}

      {/* Bottom Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 lg:hidden",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="bg-background rounded-t-3xl shadow-2xl h-[90dvh] max-h-[90dvh] flex flex-col">
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 border-b border-border/40 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold">A</span>
              </div>
              <div>
                <h3 className="font-semibold">Alley</h3>
                <p className="text-xs text-muted-foreground">Your local guide</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="rounded-full"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Chat Content */}
          <div className="flex-1 min-h-0 overflow-hidden px-4">
            <ChatInterface
              className="h-full"
              itineraryContext={itineraryContext}
              selectedTemplate={selectedTemplate}
            />
          </div>
        </div>
      </div>
    </>
  );
}
