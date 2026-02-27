/**
 * Enhanced Duplicate Spots Removal Script
 *
 * Strategies:
 * 1. Normalized name + address matching (strip accents, special chars, whitespace)
 * 2. Coordinate proximity: spots within 50m with similar names
 * 3. Smart merge: keep the richest record (most photos, longest description, verified)
 *
 * Usage:
 *   npx tsx scripts/remove-duplicates.ts --dry-run           # Preview all cities
 *   npx tsx scripts/remove-duplicates.ts --dry-run --city=busan  # Preview one city
 *   npx tsx scripts/remove-duplicates.ts --city=busan        # Execute for one city
 *   npx tsx scripts/remove-duplicates.ts                     # Execute all cities
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// Types
// ============================================================================

interface RawSpot {
    id: string;
    name: { en: string; [key: string]: string } | null;
    description: { en: string; [key: string]: string } | null;
    address: { en: string; [key: string]: string } | null;
    category: string | null;
    subcategories: string[] | null;
    location: { type: string; coordinates: [number, number] } | null; // [lng, lat]
    localley_score: number | null;
    local_percentage: number | null;
    photos: string[] | null;
    tips: { en: string; [key: string]: string } | null;
    verified: boolean | null;
    trending_score: number | null;
    created_at: string;
}

interface DuplicateGroup {
    keeper: RawSpot;
    duplicates: RawSpot[];
    reason: string;
}

interface CityReport {
    city: string;
    totalSpots: number;
    duplicateGroups: number;
    spotsToDelete: number;
    details: Array<{
        name: string;
        copies: number;
        keepId: string;
        deleteIds: string[];
        reason: string;
    }>;
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a string for dedup comparison.
 * Removes accents, special chars, extra whitespace. Lowercases.
 */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9\s]/g, '')     // Remove special chars
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Haversine distance between two points in meters.
 */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if two normalized names are similar enough to be the same spot.
 * Uses substring containment or high token overlap.
 */
function namesSimilar(a: string, b: string): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    // One contains the other
    if (a.includes(b) || b.includes(a)) return true;

    // Token overlap: if 80%+ tokens match, consider similar
    const tokensA = new Set(a.split(' ').filter(t => t.length > 1));
    const tokensB = new Set(b.split(' ').filter(t => t.length > 1));
    if (tokensA.size === 0 || tokensB.size === 0) return false;

    let overlap = 0;
    for (const t of tokensA) {
        if (tokensB.has(t)) overlap++;
    }
    const minSize = Math.min(tokensA.size, tokensB.size);
    return minSize > 0 && (overlap / minSize) >= 0.8;
}

// ============================================================================
// Quality Scoring
// ============================================================================

/**
 * Score a spot's "richness" — higher = better record to keep.
 */
function qualityScore(spot: RawSpot): number {
    let score = 0;

    // Photos (most valuable signal)
    const photoCount = spot.photos?.filter(p => p && p.length > 0)?.length || 0;
    score += photoCount * 10;

    // Description length
    const descLen = spot.description?.en?.length || 0;
    score += Math.min(descLen, 500); // Cap at 500

    // Has valid coordinates (not 0,0)
    if (spot.location?.coordinates) {
        const [lng, lat] = spot.location.coordinates;
        if (lat !== 0 && lng !== 0) score += 100;
    }

    // Verified spots are more valuable
    if (spot.verified) score += 200;

    // Has localley score
    if (spot.localley_score && spot.localley_score > 0) score += 50;

    // Has subcategories
    if (spot.subcategories && spot.subcategories.length > 0) score += 30;

    // Has tips
    if (spot.tips?.en && spot.tips.en.length > 0) score += 40;

    return score;
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Extract coordinates from a spot, returns [lat, lng] or null.
 */
function getCoords(spot: RawSpot): [number, number] | null {
    if (!spot.location?.coordinates) return null;
    const [lng, lat] = spot.location.coordinates;
    if (lat === 0 && lng === 0) return null;
    return [lat, lng];
}

/**
 * Extract the city name from a spot's address for grouping.
 */
function extractCityFromAddress(spot: RawSpot): string {
    const address = spot.address?.en || '';
    // Last part of comma-separated address is usually the city/country
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
        return normalize(parts[parts.length - 2] || parts[parts.length - 1]);
    }
    return normalize(address);
}

/**
 * Find all duplicate groups in a list of spots.
 */
function findDuplicateGroups(spots: RawSpot[]): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const claimed = new Set<string>(); // IDs already assigned to a group

    // Strategy 1: Exact normalized name + normalized address
    const nameAddrMap = new Map<string, RawSpot[]>();
    for (const spot of spots) {
        const nameEn = normalize(spot.name?.en || '');
        const addrEn = normalize(spot.address?.en || '');
        if (!nameEn) continue;
        const key = `${nameEn}|${addrEn}`;
        if (!nameAddrMap.has(key)) nameAddrMap.set(key, []);
        nameAddrMap.get(key)!.push(spot);
    }

    for (const [, group] of nameAddrMap) {
        if (group.length <= 1) continue;

        // Sort by quality score descending — keep the best
        group.sort((a, b) => qualityScore(b) - qualityScore(a));
        const [keeper, ...dupes] = group;

        claimed.add(keeper.id);
        for (const d of dupes) claimed.add(d.id);

        groups.push({
            keeper,
            duplicates: dupes,
            reason: 'normalized name+address match',
        });
    }

    // Strategy 2: Same normalized name, different address (e.g. slight address variation)
    const nameOnlyMap = new Map<string, RawSpot[]>();
    for (const spot of spots) {
        if (claimed.has(spot.id)) continue;
        const nameEn = normalize(spot.name?.en || '');
        if (!nameEn) continue;
        if (!nameOnlyMap.has(nameEn)) nameOnlyMap.set(nameEn, []);
        nameOnlyMap.get(nameEn)!.push(spot);
    }

    for (const [, group] of nameOnlyMap) {
        if (group.length <= 1) continue;

        // Only merge if they're from the same city
        const cityGroups = new Map<string, RawSpot[]>();
        for (const spot of group) {
            const city = extractCityFromAddress(spot);
            if (!cityGroups.has(city)) cityGroups.set(city, []);
            cityGroups.get(city)!.push(spot);
        }

        for (const [, cityGroup] of cityGroups) {
            if (cityGroup.length <= 1) continue;

            cityGroup.sort((a, b) => qualityScore(b) - qualityScore(a));
            const [keeper, ...dupes] = cityGroup;

            claimed.add(keeper.id);
            for (const d of dupes) claimed.add(d.id);

            groups.push({
                keeper,
                duplicates: dupes,
                reason: 'same normalized name, same city',
            });
        }
    }

    // Strategy 3: Coordinate proximity with similar names
    const unclaimed = spots.filter(s => !claimed.has(s.id));
    const withCoords = unclaimed.filter(s => getCoords(s) !== null);

    for (let i = 0; i < withCoords.length; i++) {
        if (claimed.has(withCoords[i].id)) continue;

        const spotA = withCoords[i];
        const coordsA = getCoords(spotA)!;
        const nameA = normalize(spotA.name?.en || '');
        if (!nameA) continue;

        const nearby: RawSpot[] = [spotA];

        for (let j = i + 1; j < withCoords.length; j++) {
            if (claimed.has(withCoords[j].id)) continue;

            const spotB = withCoords[j];
            const coordsB = getCoords(spotB)!;
            const nameB = normalize(spotB.name?.en || '');
            if (!nameB) continue;

            const dist = distanceMeters(coordsA[0], coordsA[1], coordsB[0], coordsB[1]);

            // Within 50m and names are similar
            if (dist <= 50 && namesSimilar(nameA, nameB)) {
                nearby.push(spotB);
            }
        }

        if (nearby.length > 1) {
            nearby.sort((a, b) => qualityScore(b) - qualityScore(a));
            const [keeper, ...dupes] = nearby;

            claimed.add(keeper.id);
            for (const d of dupes) claimed.add(d.id);

            groups.push({
                keeper,
                duplicates: dupes,
                reason: `within 50m + similar name`,
            });
        }
    }

    return groups;
}

// ============================================================================
// Main
// ============================================================================

async function fetchAllSpots(cityFilter?: string): Promise<RawSpot[]> {
    console.log('Fetching all spots...\n');

    let query = supabase
        .from('spots')
        .select('id, name, description, address, category, subcategories, location, localley_score, local_percentage, photos, tips, verified, trending_score, created_at')
        .order('created_at', { ascending: true });

    if (cityFilter) {
        // Filter by city in address
        const cityName = cityFilter.charAt(0).toUpperCase() + cityFilter.slice(1);
        query = query.ilike("address->>'en'", `%${cityName}%`);
    }

    const { data: spots, error } = await query;

    if (error) {
        console.error('Error fetching spots:', error);
        process.exit(1);
    }

    return (spots || []) as RawSpot[];
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const cityArg = args.find(a => a.startsWith('--city='));
    const cityFilter = cityArg?.split('=')[1];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ENHANCED DUPLICATE SPOTS REMOVER`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    if (cityFilter) console.log(`  City: ${cityFilter}`);
    console.log(`  Strategies: name+addr, name-only, coordinate proximity`);
    console.log(`${'='.repeat(60)}\n`);

    const spots = await fetchAllSpots(cityFilter);
    console.log(`Found ${spots.length} spots${cityFilter ? ` for ${cityFilter}` : ''}\n`);

    if (spots.length === 0) {
        console.log('No spots found. Exiting.\n');
        return;
    }

    // Group spots by city for per-city reporting
    const cityMap = new Map<string, RawSpot[]>();
    for (const spot of spots) {
        const city = extractCityFromAddress(spot) || 'unknown';
        if (!cityMap.has(city)) cityMap.set(city, []);
        cityMap.get(city)!.push(spot);
    }

    const allGroups: DuplicateGroup[] = [];
    const cityReports: CityReport[] = [];

    // Find duplicates globally (not per-city) for cross-city dupes
    const groups = findDuplicateGroups(spots);
    allGroups.push(...groups);

    // Build per-city reports
    const spotToCityMap = new Map<string, string>();
    for (const spot of spots) {
        spotToCityMap.set(spot.id, extractCityFromAddress(spot) || 'unknown');
    }

    const cityGroupMap = new Map<string, DuplicateGroup[]>();
    for (const group of groups) {
        const city = spotToCityMap.get(group.keeper.id) || 'unknown';
        if (!cityGroupMap.has(city)) cityGroupMap.set(city, []);
        cityGroupMap.get(city)!.push(group);
    }

    for (const [city, citySpots] of cityMap) {
        const cityGroups = cityGroupMap.get(city) || [];
        const spotsToDelete = cityGroups.reduce((sum, g) => sum + g.duplicates.length, 0);

        cityReports.push({
            city,
            totalSpots: citySpots.length,
            duplicateGroups: cityGroups.length,
            spotsToDelete,
            details: cityGroups.map(g => ({
                name: g.keeper.name?.en || 'unknown',
                copies: g.duplicates.length + 1,
                keepId: g.keeper.id,
                deleteIds: g.duplicates.map(d => d.id),
                reason: g.reason,
            })),
        });
    }

    // Sort reports by spotsToDelete descending
    cityReports.sort((a, b) => b.spotsToDelete - a.spotsToDelete);

    // Print reports
    const totalToDelete = allGroups.reduce((sum, g) => sum + g.duplicates.length, 0);

    if (totalToDelete === 0) {
        console.log('No duplicates found!\n');
        return;
    }

    console.log(`Found ${allGroups.length} duplicate groups (${totalToDelete} spots to remove)\n`);

    for (const report of cityReports) {
        if (report.duplicateGroups === 0) continue;

        console.log(`\n--- ${report.city.toUpperCase()} ---`);
        console.log(`  Total: ${report.totalSpots} spots, ${report.duplicateGroups} duplicate groups, ${report.spotsToDelete} to delete`);

        for (const detail of report.details) {
            console.log(`  "${detail.name}" - ${detail.copies} copies (${detail.reason})`);
            console.log(`    Keep: ${detail.keepId}`);
            for (const delId of detail.deleteIds) {
                console.log(`    Delete: ${delId}`);
            }
        }
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  SUMMARY: ${totalToDelete} spots to delete across ${cityReports.filter(r => r.spotsToDelete > 0).length} cities`);
    console.log(`${'─'.repeat(60)}\n`);

    if (dryRun) {
        console.log('DRY RUN - No changes made.\n');
        console.log('Run without --dry-run to delete duplicates.\n');
        return;
    }

    // Execute deletion
    console.log('Deleting duplicates...\n');

    const idsToDelete = allGroups.flatMap(g => g.duplicates.map(d => d.id));
    let deleted = 0;
    let errors = 0;

    // Delete in batches of 50
    for (let i = 0; i < idsToDelete.length; i += 50) {
        const batch = idsToDelete.slice(i, i + 50);

        const { error } = await supabase
            .from('spots')
            .delete()
            .in('id', batch);

        if (error) {
            console.error(`  Failed to delete batch ${i / 50 + 1}: ${error.message}`);
            errors += batch.length;
        } else {
            deleted += batch.length;
            console.log(`  Deleted batch ${i / 50 + 1} (${batch.length} spots)`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Deleted: ${deleted}`);
    console.log(`  Errors: ${errors}`);
    console.log(`${'='.repeat(60)}\n`);
}

main();
