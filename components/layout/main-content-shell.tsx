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

  return (
    <main
      id="main-content"
      data-main-scroll-host
      className={cn(
        "flex-1 min-h-0 overflow-y-auto",
        reserveBottomNavSpace && "pb-16 md:pb-0",
      )}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
