/**
 * Spots Data Quality Audit Script
 *
 * Reports:
 * - Duplicate candidates (fuzzy name match)
 * - Missing/broken data: no photos, weak descriptions, no coordinates
 * - Category distribution per city
 * - Localness score distribution
 * - Per-city health summary
 *
 * Usage:
 *   npx tsx scripts/audit-spots.ts                    # Audit all cities
 *   npx tsx scripts/audit-spots.ts --city=busan       # Audit one city
 *   npx tsx scripts/audit-spots.ts --json             # Output as JSON
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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
    location: { type: string; coordinates: [number, number] } | null;
    localley_score: number | null;
    local_percentage: number | null;
    photos: string[] | null;
    tips: { en: string; [key: string]: string } | null;
    verified: boolean | null;
    trending_score: number | null;
    created_at: string;
}

interface CityAudit {
    city: string;
    totalSpots: number;
    issues: {
        noPhotos: string[];
        weakDescriptions: string[];   // < 50 chars
        noCoordinates: string[];      // POINT(0 0)
        noCategory: string[];
        invalidScore: string[];       // score outside 1-6
        possibleDuplicates: Array<{ names: string[]; ids: string[]; reason: string }>;
    };
    categories: Record<string, number>;
    scores: Record<string, number>;
    healthScore: number; // 0-100
}

// ============================================================================
// Helpers
// ============================================================================

function normalize(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractCity(spot: RawSpot): string {
    const address = spot.address?.en || '';
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
        return parts[parts.length - 2] || parts[parts.length - 1] || 'unknown';
    }
    return address || 'unknown';
}

const SCORE_LABELS: Record<number, string> = {
    1: 'Tourist Trap',
    2: 'Tourist Friendly',
    3: 'Mixed Crowd',
    4: 'Local Favorite',
    5: 'Hidden Gem',
    6: 'Legendary Alley',
};

const VALID_CATEGORIES = new Set([
    'Food', 'Cafe', 'Nightlife', 'Shopping', 'Outdoor', 'Market',
    'Culture', 'Entertainment', 'Wellness', 'Accommodation',
]);

// ============================================================================
// Audit Logic
// ============================================================================

function auditSpots(spots: RawSpot[], cityName: string): CityAudit {
    const audit: CityAudit = {
        city: cityName,
        totalSpots: spots.length,
        issues: {
            noPhotos: [],
            weakDescriptions: [],
            noCoordinates: [],
            noCategory: [],
            invalidScore: [],
            possibleDuplicates: [],
        },
        categories: {},
        scores: {},
        healthScore: 100,
    };

    // Check individual spots
    for (const spot of spots) {
        const name = spot.name?.en || spot.id;

        // Photos
        const photos = spot.photos?.filter(p => p && p.length > 0) || [];
        if (photos.length === 0) {
            audit.issues.noPhotos.push(name);
        }

        // Description
        const desc = spot.description?.en || '';
        if (desc.length < 50) {
            audit.issues.weakDescriptions.push(name);
        }

        // Coordinates
        if (!spot.location?.coordinates) {
            audit.issues.noCoordinates.push(name);
        } else {
            const [lng, lat] = spot.location.coordinates;
            if (lat === 0 && lng === 0) {
                audit.issues.noCoordinates.push(name);
            }
        }

        // Category
        if (!spot.category) {
            audit.issues.noCategory.push(name);
        } else {
            audit.categories[spot.category] = (audit.categories[spot.category] || 0) + 1;
        }

        // Score
        if (!spot.localley_score || spot.localley_score < 1 || spot.localley_score > 6) {
            audit.issues.invalidScore.push(name);
        } else {
            const label = SCORE_LABELS[spot.localley_score] || `Score ${spot.localley_score}`;
            audit.scores[label] = (audit.scores[label] || 0) + 1;
        }
    }

    // Check for possible duplicates (fuzzy name matching)
    const nameMap = new Map<string, Array<{ name: string; id: string }>>();
    for (const spot of spots) {
        const normalName = normalize(spot.name?.en || '');
        if (!normalName) continue;
        if (!nameMap.has(normalName)) nameMap.set(normalName, []);
        nameMap.get(normalName)!.push({ name: spot.name?.en || '', id: spot.id });
    }

    for (const [, group] of nameMap) {
        if (group.length > 1) {
            audit.issues.possibleDuplicates.push({
                names: group.map(g => g.name),
                ids: group.map(g => g.id),
                reason: 'identical normalized name',
            });
        }
    }

    // Calculate health score (0-100)
    let deductions = 0;
    const pct = (arr: string[]) => spots.length > 0 ? arr.length / spots.length : 0;

    deductions += pct(audit.issues.noPhotos) * 30;          // Photos are important
    deductions += pct(audit.issues.weakDescriptions) * 15;   // Descriptions matter
    deductions += pct(audit.issues.noCoordinates) * 25;      // Coordinates critical
    deductions += pct(audit.issues.noCategory) * 10;
    deductions += pct(audit.issues.invalidScore) * 10;
    deductions += Math.min(audit.issues.possibleDuplicates.length / Math.max(spots.length, 1) * 10, 10);

    audit.healthScore = Math.max(0, Math.round(100 - deductions * 100));

    return audit;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const cityArg = args.find(a => a.startsWith('--city='));
    const cityFilter = cityArg?.split('=')[1];
    const jsonOutput = args.includes('--json');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  SPOTS DATA QUALITY AUDIT`);
    console.log(`${'='.repeat(60)}`);
    if (cityFilter) console.log(`  City: ${cityFilter}`);
    console.log(`${'='.repeat(60)}\n`);

    // Fetch spots
    let query = supabase
        .from('spots')
        .select('id, name, description, address, category, subcategories, location, localley_score, local_percentage, photos, tips, verified, trending_score, created_at')
        .order('created_at', { ascending: true });

    if (cityFilter) {
        const cityName = cityFilter.charAt(0).toUpperCase() + cityFilter.slice(1);
        query = query.ilike("address->>'en'", `%${cityName}%`);
    }

    const { data: spots, error } = await query;

    if (error) {
        console.error('Error fetching spots:', error);
        process.exit(1);
    }

    if (!spots || spots.length === 0) {
        console.log('No spots found.\n');
        return;
    }

    console.log(`Fetched ${spots.length} spots\n`);

    // Group by city
    const cityMap = new Map<string, RawSpot[]>();
    for (const spot of spots as RawSpot[]) {
        const city = extractCity(spot);
        if (!cityMap.has(city)) cityMap.set(city, []);
        cityMap.get(city)!.push(spot);
    }

    // Audit each city
    const audits: CityAudit[] = [];
    for (const [city, citySpots] of cityMap) {
        audits.push(auditSpots(citySpots, city));
    }

    // Sort by health score ascending (worst first)
    audits.sort((a, b) => a.healthScore - b.healthScore);

    if (jsonOutput) {
        // JSON output
        const reportPath = path.join(process.cwd(), 'data', '_audit-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(audits, null, 2));
        console.log(`Report saved to ${reportPath}\n`);
        return;
    }

    // Console output
    for (const audit of audits) {
        const healthEmoji = audit.healthScore >= 80 ? 'GOOD' : audit.healthScore >= 60 ? 'FAIR' : 'POOR';

        console.log(`\n${'─'.repeat(50)}`);
        console.log(`  ${audit.city.toUpperCase()} — ${audit.totalSpots} spots — Health: ${audit.healthScore}/100 (${healthEmoji})`);
        console.log(`${'─'.repeat(50)}`);

        // Categories
        console.log('\n  Categories:');
        const sortedCats = Object.entries(audit.categories).sort((a, b) => b[1] - a[1]);
        for (const [cat, count] of sortedCats) {
            const bar = '#'.repeat(Math.min(Math.round(count / 2), 30));
            console.log(`    ${cat.padEnd(15)} ${String(count).padStart(4)} ${bar}`);
        }

        // Score distribution
        console.log('\n  Localness Scores:');
        for (let i = 1; i <= 6; i++) {
            const label = SCORE_LABELS[i];
            const count = audit.scores[label] || 0;
            const bar = '#'.repeat(Math.min(Math.round(count / 2), 30));
            console.log(`    ${label.padEnd(18)} ${String(count).padStart(4)} ${bar}`);
        }

        // Issues
        const issues = audit.issues;
        if (issues.noPhotos.length > 0) {
            console.log(`\n  No Photos (${issues.noPhotos.length}):`);
            for (const name of issues.noPhotos.slice(0, 5)) {
                console.log(`    - ${name}`);
            }
            if (issues.noPhotos.length > 5) console.log(`    ... and ${issues.noPhotos.length - 5} more`);
        }

        if (issues.weakDescriptions.length > 0) {
            console.log(`\n  Weak Descriptions <50 chars (${issues.weakDescriptions.length}):`);
            for (const name of issues.weakDescriptions.slice(0, 5)) {
                console.log(`    - ${name}`);
            }
            if (issues.weakDescriptions.length > 5) console.log(`    ... and ${issues.weakDescriptions.length - 5} more`);
        }

        if (issues.noCoordinates.length > 0) {
            console.log(`\n  No Coordinates (${issues.noCoordinates.length}):`);
            for (const name of issues.noCoordinates.slice(0, 5)) {
                console.log(`    - ${name}`);
            }
            if (issues.noCoordinates.length > 5) console.log(`    ... and ${issues.noCoordinates.length - 5} more`);
        }

        if (issues.possibleDuplicates.length > 0) {
            console.log(`\n  Possible Duplicates (${issues.possibleDuplicates.length} groups):`);
            for (const dup of issues.possibleDuplicates.slice(0, 5)) {
                console.log(`    - "${dup.names[0]}" x${dup.ids.length} (${dup.reason})`);
            }
            if (issues.possibleDuplicates.length > 5) console.log(`    ... and ${issues.possibleDuplicates.length - 5} more`);
        }
    }

    // Overall summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  OVERALL SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    const totalSpots = audits.reduce((s, a) => s + a.totalSpots, 0);
    const totalDupes = audits.reduce((s, a) => s + a.issues.possibleDuplicates.length, 0);
    const totalNoPhotos = audits.reduce((s, a) => s + a.issues.noPhotos.length, 0);
    const totalNoCoords = audits.reduce((s, a) => s + a.issues.noCoordinates.length, 0);
    const avgHealth = Math.round(audits.reduce((s, a) => s + a.healthScore, 0) / audits.length);
    console.log(`  Cities: ${audits.length}`);
    console.log(`  Total Spots: ${totalSpots}`);
    console.log(`  Avg Health Score: ${avgHealth}/100`);
    console.log(`  Possible Duplicates: ${totalDupes} groups`);
    console.log(`  No Photos: ${totalNoPhotos} spots`);
    console.log(`  No Coordinates: ${totalNoCoords} spots`);
    console.log(`${'='.repeat(60)}\n`);
}

main();
