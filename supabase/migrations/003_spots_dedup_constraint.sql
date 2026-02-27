-- ============================================================================
-- Migration: Add deduplication constraint for spots table
-- ============================================================================
--
-- PREREQUISITE: Run the remove-duplicates.ts script FIRST to clean existing
-- duplicates, otherwise this migration will fail.
--
--   npx tsx scripts/remove-duplicates.ts --dry-run    # Preview
--   npx tsx scripts/remove-duplicates.ts              # Execute cleanup
--
-- Then apply this migration.
-- ============================================================================

-- Add a generated column for normalized English name (lowercase, trimmed)
-- This enables efficient indexing and unique constraint checks
ALTER TABLE spots
ADD COLUMN IF NOT EXISTS name_en_normalized TEXT
    GENERATED ALWAYS AS (lower(trim(name->>'en'))) STORED;

-- Add a generated column for normalized English address (lowercase, trimmed)
ALTER TABLE spots
ADD COLUMN IF NOT EXISTS address_en_normalized TEXT
    GENERATED ALWAYS AS (lower(trim(address->>'en'))) STORED;

-- Create unique index on normalized name + address
-- This prevents duplicate spots with the same name and address (case-insensitive)
-- Using a partial index to only apply when name is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_spots_unique_name_address
    ON spots(name_en_normalized, address_en_normalized)
    WHERE name_en_normalized IS NOT NULL AND name_en_normalized != '';

-- Add an index on the normalized name for faster lookups during import
CREATE INDEX IF NOT EXISTS idx_spots_name_en_normalized
    ON spots(name_en_normalized)
    WHERE name_en_normalized IS NOT NULL;
