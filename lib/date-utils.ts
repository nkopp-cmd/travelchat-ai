/**
 * Date Utilities
 *
 * Centralized date manipulation functions to avoid duplication across
 * API routes and components.
 */

/**
 * Get today's date in YYYY-MM-DD format (ISO date string)
 *
 * @example
 * ```ts
 * const today = getToday(); // "2024-01-15"
 * ```
 */
export function getToday(): string {
    return new Date().toISOString().split("T")[0];
}

/**
 * Get the start of the current week (Monday) in YYYY-MM-DD format
 *
 * @example
 * ```ts
 * const weekStart = getWeekStart(); // "2024-01-08" (Monday)
 * ```
 */
export function getWeekStart(): string {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const weekStart = new Date(now.setDate(diff));
    return weekStart.toISOString().split("T")[0];
}

/**
 * Get the start of the current month in YYYY-MM-DD format
 *
 * @example
 * ```ts
 * const monthStart = getMonthStart(); // "2024-01-01"
 * ```
 */
export function getMonthStart(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
}

/**
 * Get the end of the current month in YYYY-MM-DD format
 *
 * @example
 * ```ts
 * const monthEnd = getMonthEnd(); // "2024-01-31"
 * ```
 */
export function getMonthEnd(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];
}

/**
 * Get the end of the current day (midnight) as ISO string
 *
 * @example
 * ```ts
 * const dayEnd = getDayEnd(); // "2024-01-15T23:59:59.999Z"
 * ```
 */
export function getDayEnd(): string {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now.toISOString();
}

/**
 * Get a date N days from now in YYYY-MM-DD format
 *
 * @example
 * ```ts
 * const inSevenDays = getDaysFromNow(7); // "2024-01-22"
 * const threeDaysAgo = getDaysFromNow(-3); // "2024-01-12"
 * ```
 */
export function getDaysFromNow(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split("T")[0];
}

/**
 * Format a date string for display
 *
 * @example
 * ```ts
 * formatDate("2024-01-15"); // "January 15, 2024"
 * formatDate("2024-01-15", { weekday: 'long' }); // "Monday, January 15, 2024"
 * ```
 */
export function formatDate(
    dateStr: string,
    options: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
        day: "numeric",
    }
): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", options);
}

/**
 * Format a date as relative time (e.g., "2 days ago", "in 3 hours")
 *
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 3600000)); // "1 hour ago"
 * formatRelativeTime(new Date(Date.now() + 86400000)); // "in 1 day"
 * ```
 */
export function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);

    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (days > 0) {
        return rtf.format(diff > 0 ? days : -days, "day");
    }
    if (hours > 0) {
        return rtf.format(diff > 0 ? hours : -hours, "hour");
    }
    if (minutes > 0) {
        return rtf.format(diff > 0 ? minutes : -minutes, "minute");
    }
    return rtf.format(diff > 0 ? seconds : -seconds, "second");
}

/**
 * Check if a date string is in the past
 */
export function isPast(dateStr: string): boolean {
    return new Date(dateStr) < new Date();
}

/**
 * Check if a date string is in the future
 */
export function isFuture(dateStr: string): boolean {
    return new Date(dateStr) > new Date();
}

/**
 * Check if a date string is today
 */
export function isToday(dateStr: string): boolean {
    return dateStr.split("T")[0] === getToday();
}
