"use client";

import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Map } from "lucide-react";

interface StickyTabsProps {
  days: number;
  activeTab: string;
  onTabChange: (tab: string) => void;
  className?: string;
}

export function StickyTabs({
  days,
  activeTab,
  onTabChange,
  className,
}: StickyTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  // Generate tabs: Overview + Day tabs + Map
  const tabs = [
    { id: "overview", label: "Overview" },
    ...Array.from({ length: days }, (_, i) => ({
      id: `day-${i + 1}`,
      label: `Day ${i + 1}`,
    })),
    { id: "map", label: "Map", icon: Map },
  ];

  useEffect(() => {
    const handleScroll = () => {
      if (tabsRef.current) {
        const rect = tabsRef.current.getBoundingClientRect();
        setIsSticky(rect.top <= 56); // 56px is header height on mobile
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTab = (tabId: string) => {
    onTabChange(tabId);

    // Scroll to section
    const element = document.getElementById(tabId);
    if (element) {
      const headerOffset = 120; // header + tabs height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      ref={tabsRef}
      className={cn(
        "sticky top-14 md:top-16 z-40 -mx-4 px-4",
        "bg-background/95 backdrop-blur-xl",
        "border-b border-white/10",
        isSticky && "shadow-lg shadow-black/20",
        className
      )}
    >
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
        <div className="flex gap-1 py-2 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = "icon" in tab ? tab.icon : null;

            return (
              <button
                key={tab.id}
                onClick={() => scrollToTab(tab.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  "whitespace-nowrap flex items-center gap-1.5",
                  isActive
                    ? "bg-violet-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                )}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
