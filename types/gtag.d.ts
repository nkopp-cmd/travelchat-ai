// Optional Google Analytics sink (lib/spot-analytics.ts). Moved here from the removed viator/activity-card.
export {};

declare global {
    interface Window {
        gtag?: (command: string, eventName: string, params: Record<string, string | number>) => void;
    }
}
