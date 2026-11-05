"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trackSpotEvent, type SpotEvent } from "@/lib/spot-analytics";

const LINK_EVENTS = new Set<SpotEvent>(["add_to_trip", "open_detail", "directions"]);
let mounted = 0;
let teardown: (() => void) | null = null;

/**
 * One listener for every server-rendered spot card on the page: a card view once half of a card is visible, the
 * click event of `a[data-spot-event]` links, and client navigation for plain left clicks. Cards stay HTML only
 * (no hydration per card); this island mounts once, however many card lists the page has.
 */
export function SpotCardEvents() {
  const router = useRouter();
  useEffect(() => {
    mounted += 1;
    if (mounted === 1) teardown = listen(href => router.push(href));
    return () => {
      mounted -= 1;
      if (mounted === 0) { teardown?.(); teardown = null; }
    };
  }, [router]);
  return null;
}

export function listen(navigate: (href: string) => void) {
  const observed = new WeakSet<Element>();
  const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    if (document.visibilityState === "hidden") return;
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || !card.isConnected) continue;
      const id = card.dataset.spotCardId;
      if (id) trackSpotEvent("card_view", id);
      io?.unobserve(card);
    }
  }, { threshold: 0.5 });
  const scan = () => {
    if (!io) return;
    for (const card of document.querySelectorAll("[data-spot-card-id]")) {
      if (observed.has(card)) continue;
      observed.add(card);
      io.observe(card);
    }
  };
  scan();
  const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(scan);
  mo?.observe(document.body, { childList: true, subtree: true });

  const click = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-spot-event]");
    if (!link || event.button !== 0) return;
    const name = link.dataset.spotEvent as SpotEvent;
    const id = link.dataset.spotId;
    if (!event.defaultPrevented && id && LINK_EVENTS.has(name)) trackSpotEvent(name, id);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };
  document.addEventListener("click", click);
  return () => {
    io?.disconnect();
    mo?.disconnect();
    document.removeEventListener("click", click);
  };
}
