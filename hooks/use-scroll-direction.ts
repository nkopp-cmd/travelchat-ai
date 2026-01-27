"use client";

import { useState, useEffect } from "react";

type ScrollDirection = "up" | "down" | null;

interface UseScrollDirectionOptions {
  threshold?: number;
  initialDirection?: ScrollDirection;
}

export function useScrollDirection(options: UseScrollDirectionOptions = {}) {
  const { threshold = 10, initialDirection = null } = options;
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(initialDirection);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // At top of page, show header
      if (currentScrollY < threshold) {
        setScrollDirection(null);
        setLastScrollY(currentScrollY);
        return;
      }

      const diff = currentScrollY - lastScrollY;

      // Only trigger if scroll exceeds threshold
      if (Math.abs(diff) < threshold) {
        return;
      }

      if (diff > 0) {
        setScrollDirection("down");
      } else {
        setScrollDirection("up");
      }

      setLastScrollY(currentScrollY);
    };

    // Use passive event listener for better scroll performance
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY, threshold]);

  return scrollDirection;
}
