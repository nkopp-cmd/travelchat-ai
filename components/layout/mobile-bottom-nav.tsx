"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, MessageCircle, Map } from "lucide-react";
import { cn } from "@/lib/utils";

// Simplified 3-tab navigation for mobile
// Profile is accessible via top-right avatar menu
const navItems = [
  {
    href: "/dashboard",
    label: "Explore",
    icon: Compass,
  },
  {
    href: "/chat",
    label: "Chat",
    icon: MessageCircle,
    isChat: true, // Special elevated styling
  },
  {
    href: "/itineraries",
    label: "My Trips",
    icon: Map,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  // Don't show on landing page, auth pages, or when using wizard
  const hiddenPaths = ["/", "/sign-in", "/sign-up"];
  const isHidden = hiddenPaths.some(path => pathname === path || pathname.startsWith(path + "/"));

  if (isHidden) return null;

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "md:hidden", // Only show on mobile
        "bg-black/80 backdrop-blur-xl",
        "border-t border-white/10",
        "safe-area-bottom"
      )}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          const href = item.href;

          // Chat tab gets special elevated styling
          if (item.isChat) {
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1",
                  "-mt-2" // Slightly elevated
                )}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    "transition-all active:scale-95",
                    isActive
                      ? "bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/40"
                      : "bg-gray-800/80"
                  )}
                >
                  <item.icon className={cn(
                    "h-6 w-6",
                    isActive ? "text-white" : "text-gray-400"
                  )} />
                </div>
                <span className={cn(
                  "text-xs font-medium",
                  isActive ? "text-violet-400" : "text-gray-500"
                )}>{item.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2",
                "min-w-[64px] transition-colors",
                isActive
                  ? "text-violet-400"
                  : "text-gray-500 active:text-gray-300"
              )}
            >
              <item.icon
                className={cn(
                  "h-6 w-6 transition-all",
                  isActive && "scale-110"
                )}
              />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
