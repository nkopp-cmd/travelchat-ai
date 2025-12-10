import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
    [key: string]: unknown;
}

interface Logger {
    debug: (message: string, context?: LogContext) => void;
    info: (message: string, context?: LogContext) => void;
    warn: (message: string, context?: LogContext) => void;
    error: (message: string, error?: Error, context?: LogContext) => void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ||
    (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

function addBreadcrumb(level: LogLevel, message: string, context?: LogContext) {
    Sentry.addBreadcrumb({
        category: "log",
        message,
        level: level === "debug" ? "debug" : level === "info" ? "info" : level === "warn" ? "warning" : "error",
        data: context,
    });
}

export const logger: Logger = {
    debug: (message: string, context?: LogContext) => {
        if (!shouldLog("debug")) return;
        console.debug(formatMessage("debug", message, context));
        addBreadcrumb("debug", message, context);
    },

    info: (message: string, context?: LogContext) => {
        if (!shouldLog("info")) return;
        console.info(formatMessage("info", message, context));
        addBreadcrumb("info", message, context);
    },

    warn: (message: string, context?: LogContext) => {
        if (!shouldLog("warn")) return;
        console.warn(formatMessage("warn", message, context));
        addBreadcrumb("warn", message, context);
    },

    error: (message: string, error?: Error, context?: LogContext) => {
        if (!shouldLog("error")) return;
        console.error(formatMessage("error", message, context), error);

        // Send to Sentry
        if (error) {
            Sentry.captureException(error, {
                extra: {
                    message,
                    ...context,
                },
            });
        } else {
            Sentry.captureMessage(message, {
                level: "error",
                extra: context,
            });
        }
    },
};

// Performance tracking utilities
export function startTimer(name: string): () => number {
    const start = performance.now();
    return () => {
        const duration = performance.now() - start;
        logger.debug(`Timer [${name}]`, { duration: `${duration.toFixed(2)}ms` });
        return duration;
    };
}

export function withTiming<T>(name: string, fn: () => T): T {
    const end = startTimer(name);
    const result = fn();
    end();
    return result;
}

export async function withTimingAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const end = startTimer(name);
    const result = await fn();
    end();
    return result;
}

// API request logging
export function logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    userId?: string
) {
    const context = {
        statusCode,
        duration: `${duration.toFixed(2)}ms`,
        userId,
    };
    const message = `API ${method} ${path}`;

    if (statusCode >= 500) {
        logger.error(message, undefined, context);
    } else if (statusCode >= 400) {
        logger.warn(message, context);
    } else {
        logger.info(message, context);
    }
}

// Database query logging
export function logDbQuery(
    operation: string,
    table: string,
    duration: number,
    rowCount?: number
) {
    logger.debug(`DB ${operation} ${table}`, {
        duration: `${duration.toFixed(2)}ms`,
        rowCount,
    });
}

export default logger;
