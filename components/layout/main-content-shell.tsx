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
      className={cn(
        "flex-1 min-w-0",
        reserveBottomNavSpace && "pb-[var(--ll-nav-clearance)]",
      )}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
