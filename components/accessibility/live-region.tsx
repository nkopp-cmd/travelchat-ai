"use client";

import { useEffect, useRef, useState } from "react";

interface LiveRegionProps {
    /**
     * The message to announce. Changes to this prop will trigger announcements.
     */
    message: string;
    /**
     * The politeness level of the announcement.
     * - "polite": Wait for user to finish current task (default)
     * - "assertive": Interrupt immediately (use sparingly for critical updates)
     */
    politeness?: "polite" | "assertive";
    /**
     * Clear the message after announcement to allow re-announcement of same message.
     * Defaults to 1000 milliseconds. Use zero to keep the message.
     */
    clearAfter?: number;
}

/**
 * ARIA live region component for announcing dynamic content changes to screen readers.
 * Use this for chat messages, loading states, and other dynamic content.
 *
 * @example
 * ```tsx
 * // In your component
 * const [announcement, setAnnouncement] = useState("");
 *
 * // When new message arrives
 * setAnnouncement("New message from Alley");
 *
 * <LiveRegion message={announcement} />
 * ```
 */
export function LiveRegion({
    message,
    politeness = "polite",
    clearAfter = 1000,
}: LiveRegionProps) {
    const regionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const region = regionRef.current;
        if (!message || !region) return;

        // Populate the already-mounted live region so assistive technology sees a change.
        region.textContent = message;
        if (clearAfter > 0) {
            const timeout = setTimeout(() => {
                region.textContent = "";
            }, clearAfter);
            return () => clearTimeout(timeout);
        }
    }, [message, clearAfter]);

    return (
        <div
            ref={regionRef}
            role="status"
            aria-live={politeness}
            aria-atomic="true"
            className="sr-only"
        />
    );
}

/**
 * Hook for managing live region announcements.
 * Returns a function to trigger announcements and the LiveRegion component.
 *
 * @example
 * ```tsx
 * function ChatComponent() {
 *     const { announce, LiveRegionPortal } = useLiveAnnouncer();
 *
 *     useEffect(() => {
 *         if (newMessage) {
 *             announce(`New message: ${newMessage.content.substring(0, 100)}`);
 *         }
 *     }, [newMessage]);
 *
 *     return (
 *         <>
 *             <LiveRegionPortal />
 *             {/* rest of component *\/}
 *         </>
 *     );
 * }
 * ```
 */
export function useLiveAnnouncer(politeness: "polite" | "assertive" = "polite") {
    const [message, setMessage] = useState("");

    const announce = (newMessage: string) => {
        // Force re-announcement by clearing first
        setMessage("");
        // Use microtask to ensure state update
        queueMicrotask(() => setMessage(newMessage));
    };

    const LiveRegionPortal = () => (
        <LiveRegion message={message} politeness={politeness} />
    );

    return { announce, LiveRegionPortal };
}
