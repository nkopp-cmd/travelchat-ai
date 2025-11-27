import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production (lower for high-traffic apps)
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Environment configuration
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',

  // Ignore errors that are not actionable
  ignoreErrors: [
    // Network errors that are expected
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
  ],

  beforeSend(event, hint) {
    // Add additional context for server errors
    if (event.request) {
      // Log the URL that caused the error
      console.error('Server error on:', event.request.url);
    }

    return event;
  },
});
