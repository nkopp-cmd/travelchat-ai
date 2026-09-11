# Integrated Discovery

## Status

Implemented and locally verified on 2026-09-11. Not deployed.
This work extends the existing Next application and its actual catalog.
It does not replace Localley with the restricted Cloudflare pilot.
No production data, accounts, subscriptions, or hosting settings changed during this integration.

## Flow

1. Open an existing spot page.
2. Select **Add to itinerary**.
3. Sign in if necessary. The selected spot remains in the return URL.
4. Choose an owned itinerary in the same city.
5. Choose the day and insertion position in the existing editor.
6. Select **Add to draft**.
7. Save, or allow the existing 30-second automatic save.

Opening a link or choosing a position does not change the plan.
Bookmarks remain independent of itinerary insertion.
An unavailable place produces a clear notice instead of substitute content.
The chooser preserves the normal itinerary collection when no spot is selected.
If no matching trip exists, creation retains both the selected city and canonical spot ID.
The wizard names the selected place and explains that placement happens after creation.
A confirmed saved trip opens its editor with that spot selected.
Day and position still require explicit confirmation. This is continuation, not a required generation anchor.
City changes and multi-city mode retain the selection and explain placement limits.
Users can explicitly remove the selected place without disabling ordinary trip creation.

Search now retains the selected city.
Bookmark sign-in returns to the selected spot without automatically changing bookmark state.

## Data Safety

The server loads the canonical spot and applies existing public visibility checks.
The editor checks ownership before loading the optional spot.
City mismatches cannot enter the staging flow.
Inserted activities retain spot IDs, known coordinates, and existing plan order.
The integration does not invent visit times, prices, durations, or coordinates.
Repeated staging of the same canonical spot is blocked across the plan.
The existing explicit Copy activity action remains separate.

PATCH requires raw expected values for all overwritten fields:
`title`, `city`, `activities`, `highlights`, and `estimated_cost`.
The atomic update checks these values together with itinerary ID and owner ID.
Snapshots travel in the POST body of `save_itinerary_snapshot`, not in oversized PostgREST URL filters.
The SQL function uses invoker security, existing RLS, and a JWT ownership condition.
Missing snapshots return 428; conflicting snapshots return 409.
Old editor tabs must reload before saving against this contract.
Drafts remain visible after conflicts. Automatic retries stop.
Pending edits remain dirty after an earlier save completes.
The existing PATCH endpoint remains. An additive SQL function migration is now required for this Supabase-backed implementation.
`supabase/migrations/20260911104013_save_itinerary_snapshot.sql` remains unapplied to live Supabase.
No table columns changed. Missing function errors fail closed with HTTP 503.

Catalog-linked venue names and addresses remain read-only in the activity editor.
Users can still edit notes and timing. Replacing the place requires removing it and adding another place.
Display cleanup now preserves named canonical venues, even when names resemble advice such as "Note" or "Coffee".

## Generation Recovery

Single-city and corridor generation now distinguish generated content from a confirmed saved trip.
Persistence failures retain generated content in the response and award no creation XP.
The database-returned ID takes precedence over any model-supplied ID.
The wizard never claims saved-trip success without a confirmed UUID.

Unsaved drafts remain in memory and can be downloaded without another generation request.
No automatic save retry occurs when an insert may have committed but its response failed.
Wizard state is keyed to Clerk identity. Account changes clear private drafts.
Late generation responses and errors cannot navigate or show toasts after unmount.

The previous anonymous handoff wrote to an unscoped localStorage key and redirected to a nonexistent `/itineraries/claim` route.
Anonymous generation now offers an explicit draft download instead of that broken transfer.
Signup retains settings and the selected place, not the private draft.
Durable draft recovery and secure anonymous claiming remain unfinished.

## Verification

- The final complete suite passed 1,860 tests with four optional checks skipped.
- Machine-readable results: `test-results/integrated-discovery/full-suite.json`.
- 57 native PostgreSQL tests passed on a disposable PostgreSQL 18.6 cluster.
- The database tests cover RLS, anonymous denial, cross-owner denial, nulls, arrays, long plans, and concurrent writes.
- Concurrent updates produced one successful save and one conflict.
- 25 API tests verify the real SDK's short RPC URL and JSON body, including long Korean itineraries.
- Both enabled static layout tests passed at 390, 900, and 1440 pixels.
- Six hydrated editor scenarios passed at those widths.
- The optimized production build, TypeScript, and targeted ESLint passed.
- `git diff --check` passed.

The hydrated harness uses actual editor, staging, day, and activity components.
It checks canonical IDs, coordinates, insertion order, original snapshots, successful saves, and retained conflict drafts.
It sends no external requests and makes no database writes.
Expected 409 cases log request and save errors. No unexpected console or hydration errors occurred.

Screenshots and request evidence:

- `test-results/edit-form-browser/`: 12 hydrated editor screenshots and `report.json`.
- `test-results/integrated-discovery/`: chooser and editor layout screenshots.
- `scripts/edit-form-browser/README.md`: reproducible harness instructions.
- `scripts/itinerary-rpc/README.md`: native database evidence and repeatable checks.
- `test-results/integrated-app/`: the built app's real public pages, return URLs, and selected-place wizard at three widths.

The built-app check used the existing public catalog through a private Tailscale listener.
Paid photo and generation requests were blocked, so unavailable photos in those screenshots are intentional.
The check did not create users, generate trips, or mutate production data.
The Clerk widget rejected the private HTTP origin with `origin_invalid` on `/v1/client` and `/v1/environment`.
This is an environment blocker, not proof of a production sign-in failure.
The harness reports that blocker separately from successful redirect checks.

Review found activity controls extending beyond mobile cards and crowded status text.
Controls now stack beneath titles on mobile, expose names, and use 44px targets.
The header wraps its status below the title.
Repeated browser checks confirm controls fit their rows.
The draft notice now describes automatic saving and disappears when a save error stops it.
Review of the complete application also found clipped wizard steps at 900 pixels.
The progress control now uses compact steps until the content has enough width for labels.
All visible step buttons have names, current-step state, and 44px targets.
Repeated built-app checks verified all four steps fit at 390, 900, and 1440 pixels.

Staging selects passed text contrast of at least 4.5:1 and boundary contrast of at least 3:1.
This is not a complete application accessibility audit.

## Release Gates

- Apply the SQL function only after approval if a release still uses the temporary Supabase backend.
- Otherwise port the tested atomic contract to native D1 as part of the full migration.
- Verify authenticated navigation and saves through the complete app on a supported HTTPS origin.
- Verify genuine photo delivery separately from the intentionally blocked-photo layout checks.
- Carry the feature into the full Cloudflare application without removing existing capabilities.

Do not deploy to Vercel. Do not replace the live origin with the three-place preview.
Full migration gates still apply.
