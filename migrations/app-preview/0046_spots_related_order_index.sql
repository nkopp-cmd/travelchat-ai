-- Related spots (lib/spots/d1-queries.ts d1RelatedSpotSources) sorted the whole spots table for every spot page:
-- D1 2026-10-27 411 runs read 1.54M rows for 9,535 returned. The index matches the query's ORDER BY exactly
-- ("(local_percentage IS NULL) DESC" is the Postgres DESC NULLS FIRST order), so SQLite walks it and stops at LIMIT.
-- Rollback: DROP INDEX spots_related_order;
CREATE INDEX IF NOT EXISTS spots_related_order ON spots(localley_score DESC, (local_percentage IS NULL) DESC, local_percentage DESC, id);
