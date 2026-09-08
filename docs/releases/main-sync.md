# Main Synchronization

Date: 2026-09-08.

## Scope

Main incorporates the verified Seoul release and the reviewed Apify billing fix from PR #122.
The billing fix processes completed runs before cleanup and uses a 30-hour window for the daily poll.
It does not add a provider, schedule, or database migration.

The pending story branch remains separate at `b8c8286`.
It now contains the live saved-place and private-story security fixes and the local sign-in redirect.
Its 1,592 tests pass, with one opt-in encoder integration skipped in that run.
Those tests do not authorize media activation or prove hosted video delivery.

## Verification

- The combined main source passes all 746 tests across 97 files.
- Its fresh production build and TypeScript stage pass.
- Before the billing fix, runtime source matched the previously verified release exactly.
- The remaining changes concern cleanup exclusions and release instructions, not application behavior.
- Existing baseline lint findings and filter-cache performance work remain recorded in the Seoul release report.
- After pushing, verify that the production deployment identifies the exact main commit.
- Repeat the public Seoul workflow on that deployment before deleting its local build output.
- Observe the next scheduled social-trend poll for repeated or prematurely stale runs; no paid poll is triggered manually.

## Cleanup Rules

The stale `seoul-release` worktree entry has been removed. Its commits remain in Git.
The obsolete component preview server was stopped.
Removed only the isolated preview's installed dependencies, build output, download cache, and temporary files.
Its source snapshot, preparation scripts, configuration, and dependency lock remain available.

Remove the final local build cache only after live verification.
Compact Git objects without rewriting history or pruning preserved work.
Delete local branch pointers only when their commits are reachable from main.
Keep unmerged branches, environment credentials, agent configuration, licensed assets, and review reports.
