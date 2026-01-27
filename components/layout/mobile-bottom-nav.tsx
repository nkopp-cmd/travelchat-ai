"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Plus, Map, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";

const navItems = [
  {
    href: "/dashboard",
    label: "Explore",
    icon: Compass,
  },
  {
    href: "/itineraries/new",
    label: "Create",
    icon: Plus,
    isCreate: true,
  },
  {
    href: "/itineraries",
    label: "My Trips",
    icon: Map,
  },
  {
    href: "/profile",
    label: "Profile",
    icon: User,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

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

          // If not signed in, redirect Profile to sign-in
          const href = !isSignedIn && item.href === "/profile"
            ? "/sign-in"
            : item.href;

          if (item.isCreate) {
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center",
                  "-mt-4" // Raise the create button
                )}
              >
                <div
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center",
                    "bg-gradient-to-br from-violet-600 to-indigo-600",
                    "shadow-lg shadow-violet-500/40",
                    "transition-all active:scale-95"
                  )}
                >
                  <item.icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                </div>
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
