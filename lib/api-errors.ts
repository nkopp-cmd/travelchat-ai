/**
 * Standardized API Error Contracts
 *
 * All API routes should use these error types and helpers for consistent
 * error responses across the application.
 *
 * Error Response Format:
 * ```json
 * {
 *   "error": {
 *     "code": "string",       // Machine-readable error code
 *     "message": "string",    // Human-readable message
 *     "details": {}           // Optional additional details
 *   }
 * }
 * ```
 */

import { NextResponse } from "next/server";

/**
 * Standard error codes used across the API
 */
export const ErrorCodes = {
    // Authentication & Authorization
    UNAUTHORIZED: "unauthorized",
    FORBIDDEN: "forbidden",
    ADMIN_REQUIRED: "admin_required",

    // Validation
    VALIDATION_ERROR: "validation_error",
    INVALID_REQUEST: "invalid_request",
    MISSING_REQUIRED_FIELD: "missing_required_field",

    // Resource errors
    NOT_FOUND: "not_found",
    CONFLICT: "conflict",
    ALREADY_EXISTS: "already_exists",

    // Rate limiting & quotas
    RATE_LIMITED: "rate_limited",
    LIMIT_EXCEEDED: "limit_exceeded",
    QUOTA_EXCEEDED: "quota_exceeded",

    // Server errors
    INTERNAL_ERROR: "internal_error",
    DATABASE_ERROR: "database_error",
    EXTERNAL_SERVICE_ERROR: "external_service_error",
    TIMEOUT: "timeout",

    // Business logic
    SUBSCRIPTION_REQUIRED: "subscription_required",
    FEATURE_DISABLED: "feature_disabled",
    INSUFFICIENT_CREDITS: "insufficient_credits",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Standard API error structure
 */
export interface ApiError {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

/**
 * Standard API error response structure
 */
export interface ApiErrorResponse {
    error: ApiError;
}

/**
 * Map of HTTP status codes for each error code
 */
const errorStatusMap: Record<ErrorCode, number> = {
    [ErrorCodes.UNAUTHORIZED]: 401,
    [ErrorCodes.FORBIDDEN]: 403,
    [ErrorCodes.ADMIN_REQUIRED]: 403,
    [ErrorCodes.VALIDATION_ERROR]: 400,
    [ErrorCodes.INVALID_REQUEST]: 400,
    [ErrorCodes.MISSING_REQUIRED_FIELD]: 400,
    [ErrorCodes.NOT_FOUND]: 404,
    [ErrorCodes.CONFLICT]: 409,
    [ErrorCodes.ALREADY_EXISTS]: 409,
    [ErrorCodes.RATE_LIMITED]: 429,
    [ErrorCodes.LIMIT_EXCEEDED]: 429,
    [ErrorCodes.QUOTA_EXCEEDED]: 429,
    [ErrorCodes.INTERNAL_ERROR]: 500,
    [ErrorCodes.DATABASE_ERROR]: 500,
    [ErrorCodes.EXTERNAL_SERVICE_ERROR]: 502,
    [ErrorCodes.TIMEOUT]: 504,
    [ErrorCodes.SUBSCRIPTION_REQUIRED]: 402,
    [ErrorCodes.FEATURE_DISABLED]: 403,
    [ErrorCodes.INSUFFICIENT_CREDITS]: 402,
};

/**
 * Create a standardized API error response
 *
 * @example
 * ```ts
 * return apiError(ErrorCodes.NOT_FOUND, "Itinerary not found");
 *
 * return apiError(
 *     ErrorCodes.VALIDATION_ERROR,
 *     "Invalid request body",
 *     { fields: ["city", "days"] }
 * );
 * ```
 */
export function apiError(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
    const status = errorStatusMap[code] || 500;

    return NextResponse.json(
        {
            error: {
                code,
                message,
                ...(details && { details }),
            },
        },
        { status }
    );
}

/**
 * Pre-built error responses for common scenarios
 */
export const Errors = {
    /** User is not authenticated */
    unauthorized: (message = "Please sign in to continue.") =>
        apiError(ErrorCodes.UNAUTHORIZED, message),

    /** User lacks permission for this action */
    forbidden: (message = "You don't have permission to perform this action.") =>
        apiError(ErrorCodes.FORBIDDEN, message),

    /** Admin access required */
    adminRequired: (message = "Admin access required.") =>
        apiError(ErrorCodes.ADMIN_REQUIRED, message),

    /** Request validation failed */
    validationError: (message: string, fields?: string[]) =>
        apiError(ErrorCodes.VALIDATION_ERROR, message, fields ? { fields } : undefined),

    /** Resource not found */
    notFound: (resource: string) =>
        apiError(ErrorCodes.NOT_FOUND, `${resource} not found.`),

    /** Rate limit exceeded */
    rateLimited: (retryAfter?: number) =>
        apiError(
            ErrorCodes.RATE_LIMITED,
            "Too many requests. Please try again later.",
            retryAfter ? { retryAfter } : undefined
        ),

    /** Usage limit exceeded */
    limitExceeded: (limitType: string, current: number, limit: number, resetAt?: string) =>
        apiError(ErrorCodes.LIMIT_EXCEEDED, `You've reached your ${limitType} limit.`, {
            limitType,
            current,
            limit,
            resetAt,
        }),

    /** Internal server error */
    internalError: (message = "An unexpected error occurred. Please try again.") =>
        apiError(ErrorCodes.INTERNAL_ERROR, message),

    /** Database operation failed */
    databaseError: (message = "Database operation failed. Please try again.") =>
        apiError(ErrorCodes.DATABASE_ERROR, message),

    /** External service (API) failed */
    externalServiceError: (service: string) =>
        apiError(
            ErrorCodes.EXTERNAL_SERVICE_ERROR,
            `Failed to communicate with ${service}. Please try again.`
        ),

    /** Request timed out */
    timeout: (message = "The request timed out. Please try again.") =>
        apiError(ErrorCodes.TIMEOUT, message),

    /** Subscription required for this feature */
    subscriptionRequired: (feature: string, requiredTier: string) =>
        apiError(
            ErrorCodes.SUBSCRIPTION_REQUIRED,
            `Upgrade to ${requiredTier} to access ${feature}.`,
            { requiredTier, feature }
        ),

    /** Feature is restricted to a higher tier */
    featureRestricted: (feature: string, requiredTier: string) =>
        apiError(
            ErrorCodes.SUBSCRIPTION_REQUIRED,
            `${feature} is available on ${requiredTier} and higher plans.`,
            { requiredTier, feature }
        ),
} as const;

/**
 * Type guard to check if an error response is an ApiErrorResponse
 */
export function isApiError(response: unknown): response is ApiErrorResponse {
    return (
        typeof response === "object" &&
        response !== null &&
        "error" in response &&
        typeof (response as ApiErrorResponse).error === "object" &&
        "code" in (response as ApiErrorResponse).error &&
        "message" in (response as ApiErrorResponse).error
    );
}

/**
 * Extract error details from a caught error
 * Useful for logging and error reporting
 */
export function extractErrorDetails(error: unknown): {
    message: string;
    stack?: string;
    name?: string;
} {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
            name: error.name,
        };
    }

    return {
        message: String(error),
    };
}

/**
 * Safe error handler for API routes
 * Logs the error and returns a standardized response
 *
 * @example
 * ```ts
 * export async function GET() {
 *     try {
 *         // ... your code
 *     } catch (error) {
 *         return handleApiError(error, "Failed to fetch data");
 *     }
 * }
 * ```
 */
export function handleApiError(
    error: unknown,
    context: string
): NextResponse<ApiErrorResponse> {
    const details = extractErrorDetails(error);

    // Log error for debugging (in production, use structured logging)
    console.error(`[API Error] ${context}:`, details);

    // Don't expose internal error details to clients
    return Errors.internalError();
}
