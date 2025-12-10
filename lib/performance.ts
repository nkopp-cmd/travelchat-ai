import * as Sentry from "@sentry/nextjs";

// Web Vitals metric types
interface Metric {
    name: string;
    value: number;
    rating: "good" | "needs-improvement" | "poor";
    id: string;
}

// Thresholds for Core Web Vitals
const THRESHOLDS = {
    LCP: { good: 2500, poor: 4000 },    // Largest Contentful Paint
    FID: { good: 100, poor: 300 },       // First Input Delay
    CLS: { good: 0.1, poor: 0.25 },      // Cumulative Layout Shift
    FCP: { good: 1800, poor: 3000 },     // First Contentful Paint
    TTFB: { good: 800, poor: 1800 },     // Time to First Byte
    INP: { good: 200, poor: 500 },       // Interaction to Next Paint
};

function getRating(name: string, value: number): "good" | "needs-improvement" | "poor" {
    const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
    if (!threshold) return "good";

    if (value <= threshold.good) return "good";
    if (value <= threshold.poor) return "needs-improvement";
    return "poor";
}

// Report Web Vitals to analytics
export function reportWebVitals(metric: Metric) {
    const { name, value, rating, id } = metric;

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
        console.log(`[Web Vitals] ${name}: ${value.toFixed(2)} (${rating})`);
    }

    // Send to Sentry as a custom measurement
    Sentry.addBreadcrumb({
        category: "web-vitals",
        message: `${name}: ${value.toFixed(2)}`,
        level: rating === "poor" ? "warning" : "info",
        data: {
            name,
            value,
            rating,
            id,
        },
    });

    // Report poor metrics as issues
    if (rating === "poor") {
        Sentry.captureMessage(`Poor Web Vital: ${name}`, {
            level: "warning",
            tags: {
                webVital: name,
                rating,
            },
            extra: {
                value,
                threshold: THRESHOLDS[name as keyof typeof THRESHOLDS],
            },
        });
    }

    // Send to analytics endpoint if configured
    if (process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT) {
        fetch(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: "web-vital",
                name,
                value,
                rating,
                id,
                url: window.location.href,
                timestamp: Date.now(),
            }),
        }).catch(() => {
            // Silently fail - analytics shouldn't break the app
        });
    }
}

// Track custom performance marks
export function markPerformance(name: string) {
    if (typeof performance !== "undefined" && performance.mark) {
        performance.mark(name);
    }
}

export function measurePerformance(name: string, startMark: string, endMark?: string) {
    if (typeof performance !== "undefined" && performance.measure) {
        try {
            const measure = performance.measure(
                name,
                startMark,
                endMark || undefined
            );
            return measure.duration;
        } catch {
            return null;
        }
    }
    return null;
}

// Track route changes
let lastRoute = "";
let routeChangeStart = 0;

export function trackRouteChange(route: string) {
    if (lastRoute && lastRoute !== route) {
        const duration = performance.now() - routeChangeStart;

        Sentry.addBreadcrumb({
            category: "navigation",
            message: `Route change: ${lastRoute} → ${route}`,
            level: "info",
            data: {
                from: lastRoute,
                to: route,
                duration: `${duration.toFixed(2)}ms`,
            },
        });
    }

    lastRoute = route;
    routeChangeStart = performance.now();
}

// Memory usage tracking (where available)
export function getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
    if (typeof performance !== "undefined" && "memory" in performance) {
        const memory = (performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
        return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
        };
    }
    return null;
}

// Report memory usage periodically
export function startMemoryMonitoring(intervalMs = 60000) {
    if (typeof window === "undefined") return () => {};

    const interval = setInterval(() => {
        const memory = getMemoryUsage();
        if (memory) {
            const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
            const totalMB = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);

            Sentry.addBreadcrumb({
                category: "memory",
                message: `Memory usage: ${usedMB}MB / ${totalMB}MB`,
                level: "info",
            });
        }
    }, intervalMs);

    return () => clearInterval(interval);
}

export { getRating };
