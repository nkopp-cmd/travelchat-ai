#!/usr/bin/env bash
# Heavy CI verification for the D1 candidate workflow, run inside ONE run-heavy slot.
# The checks were 96 vitest + 77 eslint + 30 node commands in series (~21 min). They now run
# as four independent lanes in parallel: one vitest run, one eslint run, tsc, and the node lane
# (proof containers and node --test files keep their original order). Every lane must pass.
# Add a new test file to VITEST_FILES (or a source file to ESLINT_FILES) AND to the workflow
# paths filter; scripts/ci/heavy-verify.test.mjs fails when a listed file can skip CI.
set -uo pipefail
cd "$(dirname "$0")/../.."

VITEST_FILES=(
  __tests__/components/generated-preview.test.tsx
  __tests__/lib/generated-preview.test.ts
  __tests__/api/itinerary-save-candidate.test.ts
  __tests__/api/itinerary-update-candidate.test.ts
  __tests__/api/subscription-checkout-live.test.ts
  __tests__/lib/borderless-guard.test.ts
  __tests__/components/borderless-navigation.test.tsx
  __tests__/components/lazy-toaster.test.tsx
  __tests__/middleware-redirect.test.ts
  __tests__/components/map-text-safety.test.tsx
  __tests__/lib/spot-analytics.test.ts
  __tests__/lib/spot-event-store.test.ts
  __tests__/lib/funnel-analytics.test.ts
  __tests__/components/save-spot-button.test.tsx
  __tests__/components/city-quick-filters.test.tsx
  __tests__/components/auth-form-return.test.tsx
  __tests__/lib/trip-date-range.test.ts
  __tests__/components/planner-dates.test.tsx
  __tests__/lib/planner-draft.test.ts
  __tests__/components/planner-resume.test.tsx
  __tests__/components/planner-auth-return.test.tsx
  __tests__/components/weekly-shared-cards.test.tsx
  __tests__/components/icon-geometry.test.tsx
  __tests__/components/spot-card.test.tsx
  __tests__/components/route-preview.test.tsx
  __tests__/components/place-autocomplete.test.tsx
  __tests__/lib/places-readiness.test.ts
  __tests__/lib/spot-display-geography.test.ts
  __tests__/lib/weekly-trending-spots.test.ts
  __tests__/lib/spots-public-quality.test.ts
  __tests__/lib/viral-scout-rows.test.ts
  __tests__/lib/viral-feed.test.ts
  __tests__/lib/viral-events.test.ts
  __tests__/components/viral-spots.test.tsx
  __tests__/lib/pin-clusters.test.ts
  __tests__/components/spot-pin-map.test.tsx
  __tests__/lib/itinerary-pins.test.ts
  __tests__/app/itinerary-action-bar.test.ts
  __tests__/components/spot-detail-map.test.tsx
  __tests__/lib/weekly-social-trends.test.ts
  __tests__/components/source-chat-viewport.test.tsx
  __tests__/components/main-content-shell.test.tsx
  __tests__/components/spots-scroll-layout.test.tsx
  __tests__/lib/mobile-chrome.test.ts
  __tests__/components/landing-planner.test.tsx
  __tests__/components/conditional-navbar.test.tsx
  __tests__/motion-tokens.test.ts
  __tests__/lib/auth-notification-store.test.ts
  __tests__/app/explore-public-itineraries.test.ts
  __tests__/app/explore-candidate-page.test.tsx
  __tests__/components/itinerary-detail-design-tokens.test.ts
  __tests__/components/intent-link.test.tsx
  __tests__/components/spots-map.test.tsx
  __tests__/app/itinerary-detail-cache.test.ts
  __tests__/app/public-metadata-and-prefetch.test.ts
  __tests__/lib/met-norway-weather.test.ts
  __tests__/lib/season-table.test.tsx
  __tests__/components/pick-conditions.test.tsx
  __tests__/components/trip-outlook.test.tsx
  __tests__/public-headers.test.ts
  __tests__/components/chat-design-tokens.test.ts
  __tests__/app/chat-history-pair.test.tsx
  __tests__/lib/chat-conditions.test.ts
  __tests__/components/page-header-pattern.test.tsx
  __tests__/lib/help-phrases.test.ts
  __tests__/api/help-menu.test.ts
  __tests__/lib/help-pay.test.ts
  __tests__/api/help-open.test.ts
  __tests__/lib/driver-card.test.ts
  __tests__/components/spot-activities.test.tsx
  __tests__/lib/community-qa.test.ts
  __tests__/lib/community-access.test.ts
  __tests__/lib/places-quota.test.ts
  __tests__/lib/spot-photos.test.ts
  __tests__/lib/own-spot-photo.test.ts
  __tests__/lib/spots-d1-backend.test.ts
  __tests__/api/process-social-submissions-route.test.ts
  __tests__/lib/d1-rpc.test.ts
  __tests__/lib/d1-rpc-social.test.ts
  __tests__/lib/d1-facade-coverage.test.ts
  __tests__/lib/d1-postgrest.test.ts
  __tests__/lib/hybrid-client.test.ts
  __tests__/lib/user-challenges-helper.test.ts
  __tests__/components/dashboard-design-tokens.test.ts
  __tests__/components/viator-suggestions-lazy.test.tsx
  __tests__/lib/itinerary-grounded-generation.test.ts
  __tests__/lib/provider-probe.test.ts
  __tests__/api/ai-provider-probe-route.test.ts
  __tests__/lib/lifetime-plan-display.test.ts
  __tests__/api/auth-notification-routes.test.ts
  __tests__/hooks/auth-notification-ownership.test.tsx
  __tests__/api/source-owner-readers.test.ts
  __tests__/lib/source-lifetime-authority.test.ts
  __tests__/lib/usage-tracking-atomic.test.ts
  __tests__/lib/stripe-live-session.test.ts
  __tests__/api/subscription-webhook-live.test.ts
  __tests__/lib/stripe-customer-ownership.test.ts
  __tests__/lib/stripe-webhook-crypto.test.ts
  __tests__/components/preview-save-spot-button.test.tsx
  __tests__/lib/saved-spot-candidate-url.test.ts
  __tests__/lib/preview-saved-spot-actor.test.ts
  __tests__/components/preview-chat-composer.test.tsx
  __tests__/lib/subscription-mail.test.ts
  __tests__/lib/app-data-preview-chat-history-page.test.ts
  __tests__/pages/chat-history-candidate.test.tsx
  __tests__/api/chat-candidate-route.test.ts
  __tests__/api/chat-route-provider.test.ts
  __tests__/lib/app-data-preview-chat-request.test.ts
  __tests__/lib/app-data-preview-chat-spots.test.ts
  __tests__/lib/app-data-preview-chat-usage.test.ts
  __tests__/app/itinerary-not-found.test.tsx
  __tests__/lib/app-data-preview-itinerary-editor.test.ts
  __tests__/app/itinerary-edit-candidate-page.test.tsx
  __tests__/components/itinerary-edit-candidate-form.test.tsx
  __tests__/api/itinerary-export-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-export.test.ts
  __tests__/app/itinerary-detail-candidate-page.test.tsx
  __tests__/api/generate-v2-stream-route.test.ts
  __tests__/lib/chat-provider-fallback.test.ts
  __tests__/lib/chat-readiness.test.ts
  __tests__/lib/itinerary-provider-meta.test.ts
  __tests__/lib/llm-orchestrator.test.ts
  __tests__/lib/current-image-generation.test.ts
  __tests__/api/itinerary-provider-fallback.test.ts
  __tests__/api/story-background-cache-candidate.test.ts
  __tests__/components/story-generation-options.test.tsx
  __tests__/lib/geocoding.test.ts
  __tests__/lib/social-spot-submissions.test.ts
  __tests__/cloudflare-cron-routes.test.ts
  __tests__/cloudflare-edge-html-cache.test.ts
  __tests__/middleware.test.ts
  __tests__/cloudflare-static-public-html.test.ts
  __tests__/app/planner-ssr-cities.test.tsx
  __tests__/styles/leaflet-borderless.test.ts
  __tests__/components/itinerary-wizard-template-footer.test.ts
  __tests__/lib/apify-spot-discovery.test.ts
  __tests__/lib/apify-discovery-collection.test.ts
  __tests__/api/discover-spots-with-apify-route.test.ts
  __tests__/lib/canonical-host.test.ts
  __tests__/api/story-mail-cloudflare.test.ts
  __tests__/lib/story-mail-cloudflare.test.ts
  __tests__/lib/itinerary-mail-limit.test.ts
  __tests__/lib/itinerary-mail.test.ts
  __tests__/lib/auth-mail.test.ts
  __tests__/api/itinerary-mail-candidate.test.ts
  __tests__/api/story-mail-candidate.test.ts
  __tests__/api/connect-dashboard-candidate.test.ts
  __tests__/api/admin-payout-execution-candidate.test.ts
  __tests__/api/admin-payout-calculation-candidate.test.ts
  __tests__/lib/app-data-preview-profile.test.ts
  __tests__/pages/profile-candidate.test.tsx
  __tests__/components/preview-email-preferences.test.tsx
  __tests__/lib/email-preferences-candidate-url.test.ts
  __tests__/api/subscription-action-candidate.test.ts
  __tests__/lib/preview-flux-client.test.ts
  __tests__/api/story-background-r2.test.ts
  __tests__/api/activity-thumbnails-r2.test.ts
  __tests__/api/story-render-access.test.tsx
  __tests__/api/story-slides-r2.test.ts
  __tests__/lib/glm-json-request.test.ts
  __tests__/api/itinerary-private-diagnostics.test.ts
  __tests__/api/itinerary-sanitize.test.ts
  __tests__/hooks/use-place-photo.test.tsx
  __tests__/components/auth-password-redirect.test.tsx
  __tests__/components/auth-client-adapter.test.tsx
  __tests__/components/itinerary-activity-card.test.tsx
  __tests__/api/backfill-photo-coordinate-guard.test.ts
  __tests__/api/push-subscription-candidate-route.test.ts
  __tests__/api/affiliate-click-candidate-route.test.ts
  __tests__/api/notification-preferences-unavailable.test.ts
  __tests__/api/notification-preferences-candidate-route.test.ts
  __tests__/pages/notification-settings-candidate.test.tsx
  __tests__/hooks/notification-preferences-candidate.test.tsx
  __tests__/lib/notification-candidate-url.test.ts
  __tests__/lib/auth-user-sync.test.ts
  __tests__/lib/auth-server.test.ts
  __tests__/lib/session-seed.test.tsx
  __tests__/lib/auth-schema-check.test.ts
  __tests__/lib/app-data-preview-itinerary-page.test.ts
  __tests__/lib/app-data-preview-billing-settings.test.ts
  __tests__/components/preview-billing-summary.test.tsx
  __tests__/app/itinerary-list-candidate-page.test.tsx
  __tests__/app/user-profile-lookup.test.tsx
  __tests__/lib/app-data-preview-user-profile.test.ts
  __tests__/app/dashboard-candidate-page.test.tsx
  __tests__/lib/app-data-preview-itinerary-list.test.ts
  __tests__/lib/app-data-preview-itinerary-save.test.ts
  __tests__/api/itinerary-delete-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-delete.test.ts
  __tests__/lib/app-data-preview-itinerary-update.test.ts
  __tests__/api/itinerary-detail-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-detail.test.ts
  __tests__/api/spot-photos.test.ts
  __tests__/api/version-route.test.ts
  __tests__/api/spot-photos-candidate.test.ts
  __tests__/lib/app-data-preview-spot-photos.test.ts
  __tests__/api/cities-candidate-route.test.ts
  __tests__/lib/app-data-preview-cities.test.ts
  __tests__/lib/app-data-preview-saved-spots.test.ts
  __tests__/lib/app-data-preview-conversations.test.ts
  __tests__/lib/app-data-preview-db.test.ts
  __tests__/lib/app-data-preview-story-metadata.test.ts
  __tests__/lib/app-data-preview-story-slides.test.ts
  __tests__/lib/app-data-preview-story-media.test.ts
  __tests__/lib/app-data-preview-story-cleanup.test.ts
  __tests__/lib/app-data-preview-story-tier.test.ts
  __tests__/lib/app-data-preview-billing-status.test.ts
  __tests__/lib/app-data-preview-stripe-events.test.ts
  __tests__/api/test-app-data-route.test.ts
  __tests__/api/test-app-data-spots-route.test.ts
  __tests__/api/test-app-data-stories-route.test.ts
  __tests__/api/ai-backgrounds-candidate-route.test.ts
  __tests__/api/story-persist-candidate-route.test.ts
  __tests__/api/story-persist-source-access.test.ts
  __tests__/api/story-persist-source.test.ts
  __tests__/api/story-media-candidate-route.test.ts
  __tests__/api/cleanup-stories-candidate-route.test.ts
  __tests__/api/conversations-candidate-route.test.ts
  __tests__/api/conversation-messages-candidate-route.test.ts
  __tests__/api/conversation-patch-candidate-route.test.ts
  __tests__/api/saved-spots-candidate-route.test.ts
  __tests__/api/subscription-status-candidate-route.test.ts
  __tests__/api/subscription-status-live.test.ts
  __tests__/api/subscription-webhook-candidate-route.test.ts
  __tests__/lib/app-data-preview-explore.test.ts
  __tests__/api/places-photos-route.test.ts
  __tests__/components/preview-copy-button.test.tsx
  __tests__/lib/itinerary-copy-candidate-url.test.ts
  __tests__/lib/app-data-preview-itinerary-delete-workerd.test.ts
  __tests__/api/itinerary-duplicate-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-duplicate.test.ts
  __tests__/api/admin-guides-candidate-route.test.ts
  __tests__/lib/app-data-preview-admin-guides.test.ts
  __tests__/lib/app-data-preview-user-tier.test.ts
  __tests__/api/user-tier-candidate.test.ts
  __tests__/api/connect-status-candidate-route.test.ts
  __tests__/lib/app-data-preview-guide-status.test.ts
  __tests__/api/connect-earnings-candidate-route.test.ts
  __tests__/lib/app-data-preview-guide-earnings.test.ts
  __tests__/api/geocode-stored-candidate-route.test.ts
  __tests__/lib/app-data-preview-stored-geocode.test.ts
  __tests__/api/geocode-batch-stored-candidate-route.test.ts
  __tests__/api/leaderboard-candidate-route.test.ts
  __tests__/lib/app-data-preview-leaderboard.test.ts
  __tests__/api/email-preferences-candidate-route.test.ts
  __tests__/lib/app-data-preview-email-preferences.test.ts
  __tests__/api/notifications-candidate-route.test.ts
  __tests__/hooks/notification-inbox-candidate.test.tsx
  __tests__/hooks/notifications-prefetch.test.tsx
  __tests__/pages/notification-center-candidate.test.tsx
  __tests__/api/admin-payout-approval-candidate-route.test.ts
  __tests__/lib/app-data-preview-payout-approval.test.ts
  __tests__/components/preview-guide-application.test.tsx
  __tests__/pages/guide-application-candidate.test.tsx
  __tests__/pages/guide-dashboard-candidate.test.tsx
  __tests__/lib/guide-application-candidate-url.test.ts
  __tests__/lib/app-data-preview-guide-application-page.test.ts
  __tests__/lib/preview-guide-intent.test.ts
  __tests__/api/connect-onboard-candidate-route.test.ts
  __tests__/lib/app-data-preview-guide-application.test.ts
  __tests__/api/admin-guide-reject-candidate-route.test.ts
  __tests__/lib/spots-query-public-rows.test.ts
  __tests__/lib/spots-query-timeout.test.ts
  __tests__/lib/source-public-reviews.test.ts
  __tests__/lib/source-public-reviews-workerd.test.ts
  __tests__/api/reviews-route.test.ts
  __tests__/lib/city-spot-counts.test.ts
  __tests__/lib/d1-spot-index-plans.test.ts
  __tests__/components/owner-email-preview-dialog.test.tsx
  __tests__/lib/itinerary-mail-candidate-url.test.ts
  __tests__/lib/app-data-preview-itinerary-mail.test.ts
  __tests__/lib/app-data-preview-story-mail.test.ts
  __tests__/lib/app-data-preview-story-gallery.test.ts
  __tests__/app/story-gallery-candidate.test.tsx
  __tests__/lib/app-data-preview-story-upload.test.ts
  __tests__/lib/app-data-preview-fresh-story-backgrounds.test.ts
  __tests__/lib/supabase-read-only.test.ts
  __tests__/lib/naver-local.test.ts
  __tests__/api/naver-local-route.test.ts
  __tests__/components/spot-photo-image.test.tsx
)

ESLINT_FILES=(
  app/itineraries/preview/page.tsx
  app/itineraries/preview/layout.tsx
  lib/trips/generated-preview.ts
  scripts/check-borderless.mjs
  scripts/verify-spot-card-routes.mjs
  __tests__/middleware-redirect.test.ts
  components/ui/google-map.tsx
  components/ui/kakao-map.tsx
  components/ui/leaflet-map.tsx
  lib/spot-analytics.ts
  components/spots/spot-event-link.tsx
  components/spots/save-spot-button.tsx
  __tests__/lib/spot-analytics.test.ts
  __tests__/components/save-spot-button.test.tsx
  components/spots/city-quick-filters.tsx
  __tests__/components/city-quick-filters.test.tsx
  e2e/spots-layout.spec.ts
  components/chat/source-chat-page.tsx
  __tests__/components/source-chat-viewport.test.tsx
  components/layout/main-content-shell.tsx
  __tests__/components/main-content-shell.test.tsx
  __tests__/components/spots-scroll-layout.test.tsx
  app/page.tsx
  components/landing/
  components/layout/navbar.tsx
  components/layout/navbar-drawer.tsx
  components/layout/navbar-routes.ts
  components/layout/conditional-navbar.tsx
  __tests__/components/landing-planner.test.tsx
  __tests__/components/conditional-navbar.test.tsx
  lib/places-quota.ts
  __tests__/lib/places-quota.test.ts
  lib/spots/own-photo.ts
  __tests__/lib/own-spot-photo.test.ts
  lib/itineraries/grounded-generation.ts
  __tests__/lib/itinerary-grounded-generation.test.ts
  lib/llm/provider-probe.ts
  app/api/cron/ai-provider-probe/route.ts
  __tests__/lib/provider-probe.test.ts
  __tests__/api/ai-provider-probe-route.test.ts
  lib/notifications/auth-store.ts
  lib/notifications/validation.ts
  __tests__/lib/auth-notification-store.test.ts
  lib/notifications/auth-http.ts
  lib/auth/client.ts
  __tests__/api/auth-notification-routes.test.ts
  __tests__/hooks/auth-notification-ownership.test.tsx
  scripts/d1-migration/source-owner-policy-guard.mjs
  scripts/d1-migration/source-owner-policy-proof.mjs
  scripts/d1-migration/source-owner-saved-policy.mjs
  __tests__/api/source-owner-readers.test.ts
  __tests__/api/source-owner-postgres.test.ts
  lib/source-itinerary-access.ts
  scripts/d1-migration/affiliate-policy-guard.mjs
  scripts/d1-migration/affiliate-policy-proof.mjs
  scripts/d1-migration/atomic-usage-proof.mjs
  lib/usage-tracking.ts
  __tests__/lib/usage-tracking-atomic.test.ts
  __tests__/lib/stripe-live-session.test.ts
  __tests__/api/subscription-webhook-live.test.ts
  lib/stripe.ts
  app/api/subscription/checkout/route.ts
  app/api/subscription/webhook/route.ts
  app/api/connect/webhook/route.ts
  __tests__/api/subscription-checkout-live.test.ts
  __tests__/lib/stripe-customer-ownership.test.ts
  __tests__/lib/stripe-webhook-crypto.test.ts
  lib/subscription-mail.ts
  __tests__/lib/subscription-mail.test.ts
  components/spots/preview-save-spot-button.tsx
  lib/app-data/preview-saved-spot-actor.ts
  lib/app-data/saved-spot-candidate-url.ts
  __tests__/components/preview-save-spot-button.test.tsx
  __tests__/lib/preview-saved-spot-actor.test.ts
  __tests__/lib/saved-spot-candidate-url.test.ts
  components/chat/preview-chat-composer.tsx
  lib/app-data/preview-actor.ts
  __tests__/components/preview-chat-composer.test.tsx
  app/chat/page.tsx
  components/chat/preview-chat-history.tsx
  lib/app-data/preview-chat-history-page.ts
  __tests__/lib/app-data-preview-chat-history-page.test.ts
  __tests__/pages/chat-history-candidate.test.tsx
  app/api/chat/route.ts
  lib/app-data/preview-chat-request.ts
  __tests__/api/chat-candidate-route.test.ts
  __tests__/lib/app-data-preview-chat-request.test.ts
  "app/itineraries/[id]/not-found.tsx"
  components/itineraries/trip-unavailable.tsx
  __tests__/app/itinerary-not-found.test.tsx
  lib/app-data/preview-itinerary-editor.ts
  "app/itineraries/[id]/edit/page.tsx"
  components/itineraries/edit-form.tsx
  __tests__/lib/app-data-preview-itinerary-editor.test.ts
  __tests__/app/itinerary-edit-candidate-page.test.tsx
  __tests__/components/itinerary-edit-candidate-form.test.tsx
  "app/api/itineraries/[id]/export/route.ts"
  lib/app-data/preview-itinerary-export.ts
  __tests__/api/itinerary-export-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-export.test.ts
  "app/itineraries/[id]/page.tsx"
  __tests__/app/itinerary-detail-candidate-page.test.tsx
  cloudflare/opennext/cron-routes.ts
  cloudflare/opennext/worker.ts
  cloudflare/opennext/edge-html-cache.ts
  __tests__/cloudflare-edge-html-cache.test.ts
  app/privacy/page.tsx
  app/terms/page.tsx
  app/sitemap.ts
  lib/spots/public-quality.ts
  lib/viral/feed.ts
  lib/viral/events.ts
  components/spots/spot-rail.tsx
  components/spots/viral-spots.tsx
  app/trending/page.tsx
  app/trending/[slug]/page.tsx
  __tests__/lib/spots-public-quality.test.ts
  __tests__/lib/viral-scout-rows.test.ts
  __tests__/lib/viral-feed.test.ts
  __tests__/lib/viral-events.test.ts
  __tests__/components/viral-spots.test.tsx
  __tests__/middleware.test.ts
  lib/apify-spot-discovery.ts
  app/api/cron/discover-spots-with-apify/route.ts
  __tests__/lib/apify-discovery-collection.test.ts
  lib/itinerary-mail-limit.ts
  __tests__/lib/itinerary-mail-limit.test.ts
  lib/itinerary-mail.ts
  lib/auth/mail.ts
  "app/api/itineraries/[id]/email/route.ts"
  __tests__/lib/itinerary-mail.test.ts
  __tests__/api/itinerary-mail-candidate.test.ts
  app/api/connect/dashboard/route.ts
  __tests__/api/connect-dashboard-candidate.test.ts
  app/api/admin/payouts/execute/route.ts
  __tests__/api/admin-payout-execution-candidate.test.ts
  app/api/admin/payouts/calculate/route.ts
  __tests__/api/admin-payout-calculation-candidate.test.ts
  lib/app-data/preview-profile.ts
  components/profile/preview-profile.tsx
  app/profile/page.tsx
  __tests__/lib/app-data-preview-profile.test.ts
  __tests__/pages/profile-candidate.test.tsx
  components/settings/preview-email-preferences.tsx
  lib/app-data/email-preferences-candidate-url.ts
  __tests__/components/preview-email-preferences.test.tsx
  __tests__/lib/email-preferences-candidate-url.test.ts
  lib/app-data/preview-billing-action.ts
  app/api/subscription/portal/route.ts
  __tests__/api/subscription-action-candidate.test.ts
  lib/app-data/preview-subscription-state.ts
  lib/app-data/preview-subscription-read.ts
  lib/app-data/preview-stripe-errors.ts
  lib/app-data/preview-story-background-cache.ts
  lib/app-data/preview-story-usage.ts
  app/api/images/story-background/route.ts
  "app/api/images/story-background/media/[id]/route.ts"
  app/api/test-app-data/story-background/route.ts
  __tests__/api/story-background-cache-candidate.test.ts
  "app/api/itineraries/[id]/story/route.tsx"
  __tests__/api/story-render-access.test.tsx
  app/api/itineraries/generate/diagnostics.ts
  app/api/itineraries/generate/provider-fallback.ts
  app/api/itineraries/generate/shared.ts
  app/api/itineraries/generate/corridor-generation.ts
  app/api/itineraries/generate/route.ts
  __tests__/api/itinerary-private-diagnostics.test.ts
  __tests__/api/itinerary-provider-fallback.test.ts
  hooks/use-place-photo.ts
  __tests__/hooks/use-place-photo.test.tsx
  components/chat/chat-interface.tsx
  __tests__/app/chat-history-pair.test.tsx
  components/auth/auth-forms.tsx
  __tests__/components/auth-password-redirect.test.tsx
  components/activities/itinerary-activity-card.tsx
  __tests__/components/itinerary-activity-card.test.tsx
  app/api/admin/spots/backfill-photos/route.ts
  lib/place-images.ts
  __tests__/api/backfill-photo-coordinate-guard.test.ts
  app/api/affiliates/track/route.ts
  lib/affiliate-click.ts
  lib/app-data/preview-affiliate-clicks.ts
  __tests__/api/affiliate-click-candidate-route.test.ts
  app/api/notifications/push/subscribe/route.ts
  lib/app-data/preview-push-subscriptions.ts
  __tests__/api/push-subscription-candidate-route.test.ts
  app/settings/page.tsx
  __tests__/pages/notification-settings-candidate.test.tsx
  lib/app-data/notification-candidate-url.ts
  __tests__/hooks/notification-preferences-candidate.test.tsx
  __tests__/lib/notification-candidate-url.test.ts
  lib/notifications.ts
  hooks/use-notifications.ts
  components/settings/notification-preferences.tsx
  app/api/notifications/preferences/route.ts
  __tests__/api/notification-preferences-unavailable.test.ts
  lib/app-data/preview-notification-preferences.ts
  __tests__/api/notification-preferences-candidate-route.test.ts
  lib/auth/user-sync.ts
  __tests__/lib/auth-user-sync.test.ts
  lib/app-data/preview-itinerary-page.ts
  __tests__/lib/app-data-preview-itinerary-page.test.ts
  components/itineraries/preview-copy-button.tsx
  lib/app-data/itinerary-copy-candidate-url.ts
  __tests__/components/preview-copy-button.test.tsx
  __tests__/lib/itinerary-copy-candidate-url.test.ts
  __tests__/lib/app-data-preview-itinerary-delete-workerd.test.ts
  "app/api/itineraries/[id]/duplicate/route.ts"
  lib/app-data/preview-itinerary-duplicate.ts
  __tests__/api/itinerary-duplicate-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-duplicate.test.ts
  lib/app-data/preview-chat-usage.ts
  __tests__/lib/app-data-preview-chat-usage.test.ts
  scripts/d1-migration/reconcile-ledger.mjs
  scripts/d1-migration/reconcile-ledger.test.mjs
  app/api/user/tier/route.ts
  lib/app-data/preview-user-tier.ts
  __tests__/lib/app-data-preview-user-tier.test.ts
  __tests__/api/user-tier-candidate.test.ts
  scripts/d1-migration/profile-emails.mjs
  scripts/d1-migration/profile-emails.test.mjs
  app/api/test-app-data/chat-spots/route.ts
  lib/chat/spot-context.ts
  lib/app-data/preview-chat-spots.ts
  __tests__/lib/app-data-preview-chat-spots.test.ts
  components/notifications/notification-center.tsx
  __tests__/hooks/notification-inbox-candidate.test.tsx
  __tests__/pages/notification-center-candidate.test.tsx
  app/guide/apply/page.tsx
  app/guide/dashboard/page.tsx
  components/guide/preview-guide-application.tsx
  components/guide/preview-guide-dashboard.tsx
  components/guide/source-guide-dashboard.tsx
  components/guide/source-guide-application.tsx
  lib/app-data/guide-application-candidate-url.ts
  lib/app-data/preview-guide-application-page.ts
  __tests__/components/preview-guide-application.test.tsx
  __tests__/pages/guide-application-candidate.test.tsx
  __tests__/pages/guide-dashboard-candidate.test.tsx
  __tests__/lib/guide-application-candidate-url.test.ts
  __tests__/lib/app-data-preview-guide-application-page.test.ts
  app/api/admin/guides/route.ts
  lib/app-data/preview-admin-guides.ts
  lib/app-data/preview-guide-application.ts
  __tests__/api/admin-guides-candidate-route.test.ts
  __tests__/lib/app-data-preview-admin-guides.test.ts
  app/api/connect/status/route.ts
  lib/app-data/preview-guide-status.ts
  __tests__/api/connect-status-candidate-route.test.ts
  __tests__/lib/app-data-preview-guide-status.test.ts
  app/api/connect/earnings/route.ts
  lib/app-data/preview-guide-earnings.ts
  __tests__/api/connect-earnings-candidate-route.test.ts
  __tests__/lib/app-data-preview-guide-earnings.test.ts
  app/api/geocode/route.ts
  lib/app-data/preview-stored-geocode.ts
  __tests__/api/geocode-stored-candidate-route.test.ts
  __tests__/lib/app-data-preview-stored-geocode.test.ts
  app/api/geocode/batch/route.ts
  __tests__/api/geocode-batch-stored-candidate-route.test.ts
  app/api/leaderboard/route.ts
  app/leaderboard/page.tsx
  lib/app-data/preview-leaderboard.ts
  __tests__/api/leaderboard-candidate-route.test.ts
  __tests__/lib/app-data-preview-leaderboard.test.ts
  app/api/user/email-preferences/route.ts
  lib/app-data/preview-email-preferences.ts
  __tests__/api/email-preferences-candidate-route.test.ts
  __tests__/lib/app-data-preview-email-preferences.test.ts
  app/api/notifications/route.ts
  "app/api/notifications/[id]/route.ts"
  lib/app-data/preview-notifications.ts
  __tests__/api/notifications-candidate-route.test.ts
  app/api/admin/payouts/approve/route.ts
  lib/app-data/preview-payout-approval.ts
  __tests__/api/admin-payout-approval-candidate-route.test.ts
  __tests__/lib/app-data-preview-payout-approval.test.ts
  lib/app-data/preview-guide-intent.ts
  __tests__/lib/preview-guide-intent.test.ts
  app/api/connect/onboard/route.ts
  __tests__/api/connect-onboard-candidate-route.test.ts
  __tests__/lib/app-data-preview-guide-application.test.ts
  __tests__/api/admin-guide-reject-candidate-route.test.ts
  lib/source-public-reviews.ts
  __tests__/lib/source-public-reviews.test.ts
  __tests__/lib/source-public-reviews-workerd.test.ts
  lib/city-spot-counts.ts
  lib/cities-catalog.ts
  __tests__/lib/city-spot-counts.test.ts
  __tests__/lib/d1-spot-index-plans.test.ts
  components/itineraries/owner-email-preview-dialog.tsx
  lib/app-data/itinerary-mail-candidate-url.ts
  __tests__/components/owner-email-preview-dialog.test.tsx
  __tests__/lib/itinerary-mail-candidate-url.test.ts
  lib/app-data/preview-itinerary-mail.ts
  __tests__/lib/app-data-preview-itinerary-mail.test.ts
  lib/app-data/preview-billing-settings.ts
  components/settings/preview-billing-summary.tsx
  __tests__/lib/app-data-preview-billing-settings.test.ts
  __tests__/components/preview-billing-summary.test.tsx
  lib/app-data/preview-story-mail.ts
  "app/api/itineraries/[id]/notify-story-ready/route.ts"
  __tests__/api/story-mail-candidate.test.ts
  __tests__/lib/app-data-preview-story-mail.test.ts
  lib/app-data/preview-story-gallery.ts
  "app/itineraries/[id]/stories/page.tsx"
  "app/itineraries/[id]/stories/stories-client.tsx"
  __tests__/lib/app-data-preview-story-gallery.test.ts
  __tests__/app/story-gallery-candidate.test.tsx
  lib/app-data/preview-fresh-story-backgrounds.ts
  __tests__/lib/app-data-preview-fresh-story-backgrounds.test.ts
  lib/app-data/preview-story-upload.ts
  lib/app-data/preview-story-write-owner.ts
  lib/app-data/preview-story-readiness.ts
  __tests__/lib/app-data-preview-story-upload.test.ts
  lib/naver/local-search.ts
  app/api/places/naver-local/route.ts
  __tests__/lib/naver-local.test.ts
  __tests__/api/naver-local-route.test.ts
  components/spots/spot-card.tsx
  components/spots/spot-photo-image.tsx
  components/spots/spots-explorer.tsx
  __tests__/components/spot-photo-image.test.tsx
  lib/auth/server.ts
  __tests__/lib/auth-mail.test.ts
  __tests__/app/itinerary-list-candidate-page.test.tsx
  "app/itineraries/(list)/page.tsx"
  lib/app-data/preview-itinerary-list.ts
  __tests__/lib/app-data-preview-itinerary-list.test.ts
  app/api/itineraries/save/route.ts
  lib/app-data/preview-itinerary-save.ts
  __tests__/api/itinerary-save-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-save.test.ts
  lib/app-data/preview-itinerary-delete.ts
  __tests__/api/itinerary-delete-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-delete.test.ts
  "app/api/itineraries/[id]/update/route.ts"
  lib/app-data/preview-itinerary-update.ts
  __tests__/api/itinerary-update-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-update.test.ts
  "app/api/itineraries/[id]/route.ts"
  lib/app-data/preview-itinerary-detail.ts
  __tests__/api/itinerary-detail-candidate.test.ts
  __tests__/lib/app-data-preview-itinerary-detail.test.ts
  "app/api/spots/[id]/photos/route.ts"
  lib/app-data/preview-spot-photos.ts
  __tests__/api/spot-photos.test.ts
  __tests__/api/spot-photos-candidate.test.ts
  __tests__/lib/app-data-preview-spot-photos.test.ts
  scripts/d1-migration/compare-cities.mjs
  lib/app-data/city-counts.ts
  scripts/d1-migration/compare-cities.test.mjs
  lib/app-data/preview-cities.ts
  app/api/cities/route.ts
  __tests__/lib/app-data-preview-cities.test.ts
  __tests__/api/cities-candidate-route.test.ts
  lib/app-data/preview-saved-spots.ts
  lib/app-data/preview-conversations.ts
  lib/app-data/preview-db.ts
  lib/app-data/preview-story-metadata.ts
  lib/app-data/preview-story-slides.ts
  lib/app-data/preview-story-media.ts
  lib/app-data/preview-story-cleanup.ts
  lib/app-data/preview-story-tier.ts
  lib/app-data/preview-billing-status.ts
  lib/app-data/preview-stripe-events.ts
  lib/app-data/preview-story-candidate.ts
  __tests__/lib/app-data-preview-saved-spots.test.ts
  __tests__/lib/app-data-preview-conversations.test.ts
  __tests__/lib/app-data-preview-db.test.ts
  __tests__/lib/app-data-preview-story-metadata.test.ts
  __tests__/lib/app-data-preview-story-slides.test.ts
  __tests__/lib/app-data-preview-story-media.test.ts
  __tests__/lib/app-data-preview-story-cleanup.test.ts
  __tests__/lib/app-data-preview-story-tier.test.ts
  __tests__/lib/app-data-preview-billing-status.test.ts
  __tests__/lib/app-data-preview-stripe-events.test.ts
  app/api/test-app-data/route.ts
  app/api/test-app-data/spots/route.ts
  "app/api/test-app-data/stories/[id]/route.ts"
  "app/api/itineraries/[id]/ai-backgrounds/route.ts"
  "app/api/itineraries/[id]/story/persist/route.ts"
  "app/api/itineraries/[id]/story/media/[generation]/[slide]/route.ts"
  app/api/cron/cleanup-stories/route.ts
  app/api/conversations/route.ts
  app/api/conversations/messages/route.ts
  app/api/spots/save/route.ts
  app/api/subscription/status/route.ts
  middleware.ts
  __tests__/api/test-app-data-route.test.ts
  __tests__/api/test-app-data-spots-route.test.ts
  __tests__/api/test-app-data-stories-route.test.ts
  __tests__/api/ai-backgrounds-candidate-route.test.ts
  __tests__/api/story-persist-candidate-route.test.ts
  __tests__/api/story-persist-source-access.test.ts
  __tests__/api/story-persist-source.test.ts
  __tests__/api/story-media-candidate-route.test.ts
  __tests__/api/cleanup-stories-candidate-route.test.ts
  __tests__/api/conversations-candidate-route.test.ts
  __tests__/api/conversation-messages-candidate-route.test.ts
  __tests__/api/conversation-patch-candidate-route.test.ts
  __tests__/api/saved-spots-candidate-route.test.ts
  __tests__/api/subscription-status-candidate-route.test.ts
  __tests__/api/subscription-webhook-candidate-route.test.ts
)

lane_vitest() { npx vitest run "${VITEST_FILES[@]}" --maxWorkers="${VITEST_WORKERS:-2}"; }
lane_eslint() { npx eslint "${ESLINT_FILES[@]}"; }
lane_tsc() { npx tsc --noEmit; }
lane_node() {
  set -e
  node --test scripts/check-embedded-borders.checks.mjs
  node scripts/check-borderless.mjs
  node --check scripts/verify-spot-card-routes.mjs
  node scripts/generate-icons.mjs --check
  node scripts/d1-migration/source-owner-policy-proof.mjs --out "$RUNNER_TEMP/localley-source-owner-proof-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json"
  node scripts/d1-migration/affiliate-policy-proof.mjs --out "$RUNNER_TEMP/localley-affiliate-policy-proof-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json"
  node scripts/d1-migration/atomic-usage-proof.mjs --out "$RUNNER_TEMP/localley-quota-proof-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json"
  node --test scripts/photos/quarantine-source.test.mjs
  node --check scripts/check-production-health.mjs
  node --test scripts/production-health/*.test.mjs
  systemd-analyze --user verify ops/localley-user-health.service ops/localley-user-health.timer
  git fetch --no-tags --depth=1 origin 25a48dfcdae92f9a02893a731d4f248626ad4b31
  node --test scripts/d1-migration/reconcile-ledger.test.mjs
  node --test scripts/d1-migration/profile-emails.test.mjs
  node --test scripts/d1-migration/notification-history-report.test.mjs
  node --check scripts/d1-migration/notification-history-report.test.mjs
  node --test scripts/d1-migration/anonymous-read-regression.test.mjs scripts/d1-migration/source-owner-anon-permissions.test.mjs
  node --check scripts/d1-migration/anonymous-read-regression.mjs
  node scripts/d1-migration/anonymous-read-postgres-proof.mjs --out "$RUNNER_TEMP/localley-anon-proof-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json" --permissions
  node --test scripts/d1-migration/runtime-inventory.test.mjs
  node --test scripts/d1-migration/editor-proof-contract.test.mjs
  node --check scripts/d1-migration/runtime-inventory.mjs
  node --test scripts/d1-migration/source-availability.test.mjs scripts/cloudflare-source-snapshot.test.mjs scripts/d1-migration/core-import.test.mjs
  node --check scripts/d1-migration/source-availability.mjs
  node --test scripts/d1-migration/notification-inventory.test.mjs
  node --check scripts/d1-migration/notification-inventory.mjs
  node --test scripts/d1-migration/owner-rehearsal.test.mjs
  node --import tsx --test scripts/d1-migration/compare-cities.test.mjs
  node --test scripts/d1-migration/pg-to-d1-schema.test.mjs scripts/d1-migration/exit-tables-import.test.mjs scripts/d1-migration/rollback-replay.test.mjs
}

LANES=(vitest eslint tsc node)
if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' "${VITEST_FILES[@]}" | sed 's/^/vitest /'
  printf '%s\n' "${ESLINT_FILES[@]}" | sed 's/^/eslint /'
  exit 0
fi

log_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/localley-heavy-verify-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-$$}"
rm -rf "$log_dir" && mkdir -p "$log_dir"

started=$(date +%s)
if [[ "${HEAVY_VERIFY_SKIP_INSTALL:-}" != "1" ]]; then
  npm ci --prefer-offline --no-audit --no-fund || exit $?
fi
echo "install: $(( $(date +%s) - started )) s"

declare -A pids
for lane in "${LANES[@]}"; do
  (
    lane_start=$(date +%s)
    ( set -e; "lane_$lane" ) >"$log_dir/$lane.log" 2>&1
    rc=$?
    echo "$rc $(( $(date +%s) - lane_start ))" >"$log_dir/$lane.status"
    exit "$rc"
  ) &
  pids[$lane]=$!
done

failed=0
for lane in "${LANES[@]}"; do
  wait "${pids[$lane]}" || true
done
summary=()
for lane in "${LANES[@]}"; do
  read -r rc secs <"$log_dir/$lane.status" || { rc=1; secs='?'; }
  echo "::group::lane $lane (rc=$rc, ${secs} s)"
  cat "$log_dir/$lane.log"
  echo "::endgroup::"
  summary+=("$lane rc=$rc ${secs}s")
  [[ "$rc" == "0" ]] || { failed=1; echo "::error::heavy-verify lane $lane failed (rc=$rc)"; tail -40 "$log_dir/$lane.log"; }
done
echo "heavy-verify: ${summary[*]}; total $(( $(date +%s) - started )) s"
exit "$failed"
