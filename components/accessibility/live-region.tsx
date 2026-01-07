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
     * Defaults to true.
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
    const [currentMessage, setCurrentMessage] = useState("");
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (message) {
            // Clear any pending timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Set the message
            setCurrentMessage(message);

            // Clear after delay to allow re-announcement of same message
            if (clearAfter > 0) {
                timeoutRef.current = setTimeout(() => {
                    setCurrentMessage("");
                }, clearAfter);
            }
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [message, clearAfter]);

    return (
        <div
            role="status"
            aria-live={politeness}
            aria-atomic="true"
            className="sr-only"
        >
            {currentMessage}
        </div>
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
