-- ============================================================================
-- Migration: Add deduplication constraint for spots table
-- ============================================================================
--
-- Self-healing: automatically removes duplicates before creating the unique
-- index, so no manual script run is required as a prerequisite.
--
-- For each group of spots sharing the same (name, address), keeps the one
-- with the most photos, longest description, and newest created_at.
-- ============================================================================

-- Step 1: Add generated columns for normalized English name and address
ALTER TABLE spots
ADD COLUMN IF NOT EXISTS name_en_normalized TEXT
    GENERATED ALWAYS AS (lower(trim(name->>'en'))) STORED;

ALTER TABLE spots
ADD COLUMN IF NOT EXISTS address_en_normalized TEXT
    GENERATED ALWAYS AS (lower(trim(address->>'en'))) STORED;

-- Step 2: Remove duplicates, keeping the richest record per (name, address) group
-- Uses ROW_NUMBER to rank records within each group:
--   1. Most photos first
--   2. Longest description as tiebreaker
--   3. Newest record as final tiebreaker
DELETE FROM spots
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY name_en_normalized, address_en_normalized
            ORDER BY
                coalesce(array_length(photos, 1), 0) DESC,
                coalesce(length(description->>'en'), 0) DESC,
                created_at DESC
        ) AS rn
        FROM spots
        WHERE name_en_normalized IS NOT NULL AND name_en_normalized != ''
    ) ranked
    WHERE rn > 1
);

-- Step 3: Create unique index to prevent future duplicates
-- Partial index: only applies when name is not null/empty
CREATE UNIQUE INDEX IF NOT EXISTS idx_spots_unique_name_address
    ON spots(name_en_normalized, address_en_normalized)
    WHERE name_en_normalized IS NOT NULL AND name_en_normalized != '';

-- Step 4: Add lookup index for faster import dedup checks
CREATE INDEX IF NOT EXISTS idx_spots_name_en_normalized
    ON spots(name_en_normalized)
    WHERE name_en_normalized IS NOT NULL;
