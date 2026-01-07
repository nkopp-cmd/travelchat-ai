"use client";

/**
 * Skip to main content link for keyboard users and screen readers.
 * Visible only when focused, allows users to bypass navigation.
 */
export function SkipLink() {
    return (
        <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-violet-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-violet-600"
        >
            Skip to main content
        </a>
    );
}
