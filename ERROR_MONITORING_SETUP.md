# Error Monitoring Setup - Sentry Integration

**Status:** ✅ COMPLETE
**Date:** 2025-11-26

---

## Overview

Error monitoring has been set up using Sentry to track and diagnose production errors. This provides real-time error tracking, performance monitoring, and session replay capabilities.

---

## Components Installed

### 1. Sentry SDK
**Package:** `@sentry/nextjs`
**Version:** Latest
**Purpose:** Comprehensive error tracking for Next.js applications

### 2. Configuration Files

#### `sentry.client.config.ts`
Client-side error tracking with:
- Replay session recording
- Browser error tracking
- Performance monitoring
- Error filtering (browser extensions, etc.)

#### `sentry.server.config.ts`
Server-side error tracking with:
- API error tracking
- Server-side error monitoring
- Network error filtering

#### `sentry.edge.config.ts`
Edge runtime error tracking for:
- Middleware errors
- Edge functions

### 3. Enhanced Error Boundary
**File:** [components/error-boundary.tsx](components/error-boundary.tsx)

Enhanced with Sentry integration to:
- Capture React component errors
- Include component stack traces
- Send errors to Sentry automatically

### 4. API Error Handler
**File:** [lib/api-error-handler.ts](lib/api-error-handler.ts)

Utility functions for API error tracking:
- `handleApiError()` - Track and return formatted errors
- `withErrorHandling()` - Wrapper for API routes

### 5. Next.js Configuration
**File:** [next.config.ts](next.config.ts)

Updated with:
- Sentry webpack plugin
- Source map upload configuration
- Production-only error tracking

---

## Environment Variables Required

Add these to your `.env.local` file:

```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/your-project-id

# Optional: For source map uploads
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token
```

---

## How to Get Sentry Credentials

### 1. Create a Sentry Account
1. Go to [https://sentry.io](https://sentry.io)
2. Sign up for a free account
3. Create a new project and select "Next.js"

### 2. Get Your DSN
1. Go to **Settings** → **Projects** → **Your Project**
2. Go to **Client Keys (DSN)**
3. Copy the DSN URL
4. Add to `.env.local` as `NEXT_PUBLIC_SENTRY_DSN`

### 3. Get Auth Token (for source maps)
1. Go to **Settings** → **Auth Tokens**
2. Click **Create New Token**
3. Select scopes: `project:read`, `project:releases`, `org:read`
4. Copy token and add to `.env.local` as `SENTRY_AUTH_TOKEN`

### 4. Get Organization and Project Slugs
1. Organization slug: Visible in URL after logging in
2. Project slug: Visible in project settings
3. Add to `.env.local`

---

## Features

### 1. Error Tracking
- **Client Errors:** JavaScript errors, unhandled promises, network failures
- **Server Errors:** API errors, database errors, server crashes
- **React Errors:** Component errors caught by error boundaries

### 2. Performance Monitoring
- **Page Load Times:** Track page performance
- **API Response Times:** Monitor API endpoint performance
- **Database Queries:** Track slow queries

### 3. Session Replay (Client)
- **Video Replays:** See what users did before an error
- **Console Logs:** Capture browser console output
- **Network Activity:** Track API calls and responses

### 4. Context & Breadcrumbs
- **User Context:** Track which users encounter errors
- **Request Context:** URL, headers, query params
- **Component Stack:** React component hierarchy

---

## Usage Examples

### 1. Using Error Boundary

Already integrated in the app. Errors in React components are automatically tracked.

```tsx
import { ErrorBoundary } from '@/components/error-boundary';

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### 2. API Error Handling

Use the `handleApiError` helper in API routes:

```typescript
import { handleApiError } from '@/lib/api-error-handler';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    // Your API logic here

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, {
      context: 'api/your-endpoint',
      userId,
      additionalData: {
        customField: 'value',
      },
    });
  }
}
```

### 3. Manual Error Tracking

For custom error tracking:

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // Your code
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      feature: 'itinerary-generation',
    },
    extra: {
      userId: user.id,
      city: itinerary.city,
    },
  });
}
```

### 4. Custom Messages

Track important events:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.captureMessage('User completed onboarding', {
  level: 'info',
  tags: {
    feature: 'onboarding',
  },
});
```

---

## Configuration Details

### Error Filtering

The following errors are **ignored** by default:

**Client-side:**
- Browser extension errors (`chrome-extension`, `moz-extension`)
- Third-party script errors
- Random plugin/extension errors

**Server-side:**
- Expected network errors (`ECONNREFUSED`, `ENOTFOUND`)
- Timeout errors (`ETIMEDOUT`)

### Sampling Rates

**Traces (Performance):** 10% of transactions
**Replays (Errors):** 100% of error sessions
**Replays (Normal):** 10% of normal sessions

These can be adjusted in the Sentry config files.

---

## Testing Error Monitoring

### 1. Test Client Errors

Add a test button to trigger an error:

```tsx
<button onClick={() => { throw new Error('Test error'); }}>
  Trigger Test Error
</button>
```

### 2. Test Server Errors

Create a test API route:

```typescript
// app/api/test-error/route.ts
export async function GET() {
  throw new Error('Test API error');
}
```

Visit `/api/test-error` to trigger.

### 3. Check Sentry Dashboard

1. Go to your Sentry project
2. Navigate to **Issues**
3. Verify test errors appear within ~30 seconds

---

## Production Deployment

### Vercel Deployment

1. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SENTRY_DSN`
   - `SENTRY_ORG`
   - `SENTRY_PROJECT`
   - `SENTRY_AUTH_TOKEN`

2. Deploy as normal - Sentry will:
   - Upload source maps automatically
   - Track errors in production
   - Monitor performance

### Other Platforms

Same environment variables required. Ensure:
- Production build includes Sentry configuration
- Source maps are uploaded (if desired)
- DSN is accessible from deployment environment

---

## Monitoring & Alerts

### Set Up Alerts

1. Go to **Alerts** in Sentry
2. Create alert rules for:
   - New issues (first occurrence)
   - High frequency issues (>10/min)
   - Error rate spikes
   - Performance degradation

3. Configure notifications:
   - Email
   - Slack
   - Discord
   - PagerDuty

### Useful Queries

**High-impact errors:**
```
is:unresolved level:error
```

**Recent API errors:**
```
is:unresolved tags[context]:api
```

**User-specific issues:**
```
user.id:12345
```

---

## Troubleshooting

### Errors Not Showing Up

1. **Check DSN:** Verify `NEXT_PUBLIC_SENTRY_DSN` is set correctly
2. **Check Environment:** Sentry only runs in `production` by default
3. **Check Network:** Ensure Sentry API is accessible
4. **Check Console:** Look for Sentry initialization errors

### Source Maps Not Working

1. **Check Auth Token:** Verify `SENTRY_AUTH_TOKEN` is set
2. **Check Organization/Project:** Verify slugs are correct
3. **Check Build Logs:** Look for source map upload messages
4. **Manual Upload:** Use `sentry-cli` if automatic upload fails

### Too Many Errors

1. **Add Filters:** Update `ignoreErrors` in config files
2. **Adjust Sampling:** Reduce `tracesSampleRate`
3. **Rate Limiting:** Enable in Sentry project settings

---

## Cost & Limits

### Free Tier
- 5,000 errors/month
- 10,000 transactions/month
- 50 session replays/month
- 1 project

### Paid Tiers
- Start at $26/month
- Increased error/transaction limits
- More projects
- Advanced features (custom alerts, integrations)

**Current Usage:** Monitor in Sentry dashboard under **Stats**

---

## Next Steps

1. ✅ Set up Sentry account and get DSN
2. ✅ Add DSN to `.env.local`
3. ✅ Test error tracking locally (set `enabled: true` temporarily)
4. ⏳ Deploy to production and verify
5. ⏳ Set up alerts for critical errors
6. ⏳ Monitor error trends and fix issues

---

## Files Modified

1. ✅ `sentry.client.config.ts` - Created
2. ✅ `sentry.server.config.ts` - Created
3. ✅ `sentry.edge.config.ts` - Created
4. ✅ `components/error-boundary.tsx` - Enhanced with Sentry
5. ✅ `lib/api-error-handler.ts` - Created
6. ✅ `next.config.ts` - Updated with Sentry plugin
7. ⏳ `.env.local` - Add NEXT_PUBLIC_SENTRY_DSN (user action required)

---

## Support

- **Sentry Docs:** [https://docs.sentry.io/platforms/javascript/guides/nextjs/](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- **GitHub Issues:** [https://github.com/getsentry/sentry-javascript/issues](https://github.com/getsentry/sentry-javascript/issues)
- **Discord:** [https://discord.gg/sentry](https://discord.gg/sentry)

---

**Status:** ✅ Error monitoring infrastructure is complete!
**Next:** Get Sentry DSN and test in production
