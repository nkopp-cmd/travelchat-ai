"use client";

import { IntentLink } from "@/components/navigation/intent-link";
import { usePathname } from "next/navigation";
import { Compass, Languages, MessageCircle, Map } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { isMobileBottomNavHidden } from "@/lib/layout/mobile-chrome";

const navItems = [
  { href: "/spots", label: "Explore", icon: Compass, paths: ["/spots", "/dashboard", "/explore"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, paths: ["/chat"] },
  { href: "/itineraries", label: "My trips", icon: Map, paths: ["/itineraries"] },
  { href: "/help", label: "Help", icon: Languages, paths: ["/help"] },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  if (isMobileBottomNavHidden(pathname)) return null;
  return <nav data-app-chrome aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-50 bg-surface/95 shadow-overlay backdrop-blur-xl safe-area-bottom md:hidden">
    <div className="flex h-16 items-center justify-around gap-2 px-3">
      {navItems.map(item => {
        const active = item.paths.some(path => pathname === path || pathname.startsWith(path + '/'));
        return <IntentLink key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
          className={cn("flex min-h-11 min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-1 text-muted-foreground transition-colors motion-reduce:transition-none", active && "bg-raised font-semibold text-foreground")}>
          <item.icon weight={active ? 'fill' : 'duotone'} className="size-5" />
          <span className="text-xs leading-4">{item.label}</span>
        </IntentLink>;
      })}
    </div>
  </nav>;
}
