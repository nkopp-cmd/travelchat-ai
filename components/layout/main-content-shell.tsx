"use client";

import { usePathname } from "next/navigation";
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
      className={reserveBottomNavSpace ? "flex-1 min-w-0 pb-[var(--ll-nav-clearance)]" : "flex-1 min-w-0"}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
