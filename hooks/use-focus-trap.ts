"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Focusable element selectors for focus trap
 */
const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
    /**
     * Whether the focus trap is active
     */
    isActive: boolean;
    /**
     * Whether to return focus to the previously focused element when deactivated
     * Defaults to true
     */
    returnFocus?: boolean;
    /**
     * Whether to focus the first focusable element on activation
     * Defaults to true
     */
    autoFocus?: boolean;
}

/**
 * Hook to trap focus within a container element.
 *
 * This is useful for modals, dialogs, and other overlay components
 * where keyboard navigation should be constrained to the container.
 *
 * Note: Radix UI Dialog already handles focus trapping, so this hook
 * is primarily for custom modal implementations.
 *
 * @example
 * ```tsx
 * function CustomModal({ isOpen, onClose }) {
 *     const containerRef = useFocusTrap({ isActive: isOpen });
 *
 *     if (!isOpen) return null;
 *
 *     return (
 *         <div ref={containerRef} role="dialog" aria-modal="true">
 *             <button onClick={onClose}>Close</button>
 *             <input type="text" />
 *         </div>
 *     );
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
    isActive,
    returnFocus = true,
    autoFocus = true,
}: UseFocusTrapOptions) {
    const containerRef = useRef<T>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    // Get all focusable elements within the container
    const getFocusableElements = useCallback(() => {
        if (!containerRef.current) return [];
        return Array.from(
            containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
        ).filter((el) => el.offsetParent !== null); // Filter out hidden elements
    }, []);

    // Handle tab key navigation
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (!isActive || event.key !== 'Tab') return;

            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            // Shift+Tab from first element should go to last
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
            // Tab from last element should go to first
            else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        },
        [isActive, getFocusableElements]
    );

    // Handle escape key
    const handleEscape = useCallback(
        (event: KeyboardEvent) => {
            if (!isActive || event.key !== 'Escape') return;
            // Escape handling is typically done by the parent component
            // This is just for documentation purposes
        },
        [isActive]
    );

    useEffect(() => {
        if (!isActive) return;

        // Store currently focused element for later restoration
        previouslyFocusedRef.current = document.activeElement as HTMLElement;

        // Focus first focusable element
        if (autoFocus) {
            const focusableElements = getFocusableElements();
            if (focusableElements.length > 0) {
                // Small delay to ensure the container is rendered
                requestAnimationFrame(() => {
                    focusableElements[0].focus();
                });
            }
        }

        // Add event listeners
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);

            // Return focus to previously focused element
            if (returnFocus && previouslyFocusedRef.current) {
                previouslyFocusedRef.current.focus();
            }
        };
    }, [isActive, autoFocus, returnFocus, getFocusableElements, handleKeyDown]);

    return containerRef;
}

/**
 * Hook to manage focus return after a modal/overlay closes.
 * Simpler alternative when you don't need full focus trapping
 * (e.g., when using Radix UI which handles trapping internally).
 *
 * @example
 * ```tsx
 * function Dialog({ isOpen }) {
 *     useFocusReturn(isOpen);
 *     // ... dialog content
 * }
 * ```
 */
export function useFocusReturn(isOpen: boolean) {
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Store the currently focused element when opening
            previouslyFocusedRef.current = document.activeElement as HTMLElement;
        } else if (previouslyFocusedRef.current) {
            // Return focus when closing
            previouslyFocusedRef.current.focus();
            previouslyFocusedRef.current = null;
        }
    }, [isOpen]);
}
