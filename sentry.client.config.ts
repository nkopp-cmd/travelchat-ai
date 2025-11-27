import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production (lower for high-traffic apps)
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Replay session sampling
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Environment configuration
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',

  // Ignore errors that are not actionable
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    // Random plugins/extensions
    'originalCreateNotification',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    // Facebook-related
    'fb_xd_fragment',
    // Chrome extensions
    'chrome-extension',
  ],

  beforeSend(event, hint) {
    // Filter out errors that shouldn't be sent to Sentry
    const error = hint.originalException;

    // Don't send errors from browser extensions
    if (error && typeof error === 'object' && 'message' in error) {
      const message = String(error.message);
      if (message.includes('chrome-extension') || message.includes('moz-extension')) {
        return null;
      }
    }

    return event;
  },
});
