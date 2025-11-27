import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

interface ErrorContext {
  context: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Handle API errors with Sentry tracking
 *
 * @param error - The error that occurred
 * @param options - Context and additional data for error tracking
 * @returns NextResponse with error message
 */
export function handleApiError(
  error: unknown,
  options: ErrorContext
): NextResponse {
  const { context, userId, additionalData } = options;

  // Log to console for development
  console.error(`[API Error] ${context}:`, error);

  // Capture exception in Sentry
  Sentry.captureException(error, {
    tags: {
      context,
      api: true,
    },
    user: userId ? { id: userId } : undefined,
    extra: additionalData,
  });

  // Determine error message and status code
  let message = 'Internal server error';
  let statusCode = 500;

  if (error instanceof Error) {
    // Development mode: include error message
    if (process.env.NODE_ENV === 'development') {
      message = error.message;
    }

    // Check for specific error types
    if (error.message.includes('Unauthorized') || error.message.includes('401')) {
      message = 'Unauthorized';
      statusCode = 401;
    } else if (error.message.includes('Forbidden') || error.message.includes('403')) {
      message = 'Forbidden';
      statusCode = 403;
    } else if (error.message.includes('Not found') || error.message.includes('404')) {
      message = 'Not found';
      statusCode = 404;
    } else if (error.message.includes('Bad request') || error.message.includes('400')) {
      message = 'Bad request';
      statusCode = 400;
    }
  }

  return NextResponse.json(
    { error: message },
    { status: statusCode }
  );
}

/**
 * Wrapper for API route handlers with automatic error handling
 *
 * @param handler - The API route handler function
 * @param context - Context string for error tracking
 * @returns Wrapped handler with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  context: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, { context });
    }
  }) as T;
}
