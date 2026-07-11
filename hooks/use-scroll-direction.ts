"use client";

import { useEffect, useRef, useState } from "react";

type ScrollDirection = "up" | "down" | null;

interface UseScrollDirectionOptions {
  threshold?: number;
  initialDirection?: ScrollDirection;
}

export function useScrollDirection(options: UseScrollDirectionOptions = {}) {
  const { threshold = 10, initialDirection = null } = options;
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(initialDirection);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const scrollHost = document.querySelector<HTMLElement>("[data-main-scroll-host]");
    const scrollTarget: HTMLElement | Window = scrollHost ?? window;
    const getScrollY = () => scrollHost?.scrollTop ?? window.scrollY;

    lastScrollYRef.current = getScrollY();

    const handleScroll = () => {
      const currentScrollY = getScrollY();

      // At top of page, show header
      if (currentScrollY < threshold) {
        setScrollDirection(null);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      const diff = currentScrollY - lastScrollYRef.current;

      // Only trigger if scroll exceeds threshold
      if (Math.abs(diff) < threshold) {
        return;
      }

      if (diff > 0) {
        setScrollDirection("down");
      } else {
        setScrollDirection("up");
      }

      lastScrollYRef.current = currentScrollY;
    };

    // Use passive event listener for better scroll performance
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollTarget.removeEventListener("scroll", handleScroll);
    };
  }, [threshold]);

  return scrollDirection;
}
