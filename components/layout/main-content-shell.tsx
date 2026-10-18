"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isMobileBottomNavHidden } from "@/lib/layout/mobile-chrome";

interface MainContentShellProps {
  children: React.ReactNode;
}

export function MainContentShell({ children }: MainContentShellProps) {
  const pathname = usePathname();
  const reserveBottomNavSpace = !isMobileBottomNavHidden(pathname);
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat/");

  return (
    <main
      id="main-content"
      className={cn(
        "flex-1 min-w-0",
        // Only chat needs a bounded viewport: its messages scroll independently.
        isChat && "h-[calc(100dvh-3.5rem)] flex-none overflow-hidden md:h-[calc(100dvh-4rem)]",
        reserveBottomNavSpace && "pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0",
      )}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
