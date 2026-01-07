/**
 * City Quality Report Generator
 *
 * Generates comprehensive quality reports for one or all cities.
 * Shows spot counts, category distribution, localness distribution,
 * and quality issues.
 *
 * Usage:
 *   npx tsx scripts/generate-city-report.ts [city-slug]
 *   npx tsx scripts/generate-city-report.ts          # All enabled cities
 *   npx tsx scripts/generate-city-report.ts seoul    # Specific city
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
    ALL_CITIES,
    ENABLED_CITIES,
    getCityBySlug,
    REQUIRED_CATEGORIES,
    LOCALNESS_LABELS,
    CityConfig,
    CityStats,
} from '../lib/cities';
import { templates as staticTemplates } from '../lib/templates';

// Spot type from database
interface DbSpot {
    id: string;
    name: Record<string, string> | string;
    description: Record<string, string> | string;
    address: Record<string, string> | string;
    category: string | null;
    subcategories: string[] | null;
    localley_score: number | null;
    local_percentage: number | null;
    photos: string[] | null;
    verified: boolean | null;
    trending_score: number | null;
}

dotenv.config({ path: '.env.local' });

// ============================================
// TYPES
// ============================================

interface CityReport {
    timestamp: string;
    city: CityConfig;
    stats: CityStats;
    quality: {
        overallScore: number; // 0-100
        categoryBalance: number;
        localnessBalance: number;
        neighborhoodCoverage: number;
        imageQuality: number;
    };
    issues: {
        critical: string[];
        warnings: string[];
        suggestions: string[];
    };
    targetProgress: {
        spots: { current: number; min: number; ideal: number; percent: number };
        templates: { current: number; min: number; ideal: number; percent: number };
    };
}

// ============================================
// ANALYSIS FUNCTIONS
// ============================================

async function analyzeCity(
    supabase: SupabaseClient,
    cityConfig: CityConfig
): Promise<CityReport> {
    // Fetch spots for this city
    const { data: spots, count } = await supabase
        .from("spots")
        .select("*", { count: "exact" })
        .or(`address->>'en'.ilike.%${cityConfig.name}%,address->>'en'.ilike.%${cityConfig.slug}%`);

    const spotCount = count || 0;
    const spotData: DbSpot[] = (spots || []) as DbSpot[];

    // Count templates (from static file, filter by city name in targetAudience or name)
    const cityTemplates = staticTemplates.filter(t =>
        t.name.toLowerCase().includes(cityConfig.name.toLowerCase()) ||
        t.targetAudience.toLowerCase().includes(cityConfig.name.toLowerCase()) ||
        // For now, all templates work for all cities
        true
    );
    const templateCount = cityTemplates.length;

    // Category distribution
    const categoryDistribution: Record<string, number> = {};
    for (const spot of spotData) {
        const cat = spot.category || "Unknown";
        categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
    }

    // Localness distribution
    const localnessDistribution: Record<string, number> = {};
    for (const spot of spotData) {
        const score = spot.localley_score || 3;
        const label = LOCALNESS_LABELS[score] || "Unknown";
        localnessDistribution[label] = (localnessDistribution[label] || 0) + 1;
    }

    // Neighborhood analysis
    const neighborhoods = new Set<string>();
    for (const spot of spotData) {
        const address = typeof spot.address === 'object'
            ? (spot.address as Record<string, string>)?.en || Object.values(spot.address)[0]
            : spot.address || "";
        const parts = (address as string).split(",").map((p: string) => p.trim());
        if (parts.length > 0 && parts[0]) {
            neighborhoods.add(parts[0]);
        }
    }

    // Missing images
    const missingImages = spotData.filter(
        (s) => !s.photos || s.photos.length === 0 || !s.photos[0]
    );
    const missingImageRate = spotData.length > 0
        ? Math.round((missingImages.length / spotData.length) * 100)
        : 0;

    // Build stats
    const stats: CityStats = {
        slug: cityConfig.slug,
        spotCount,
        templateCount,
        categoryDistribution,
        localnessDistribution,
        neighborhoodCoverage: neighborhoods.size,
        missingImageRate,
        lastUpdated: new Date().toISOString(),
    };

    // Calculate quality scores
    const quality = calculateQualityScores(cityConfig, stats);

    // Identify issues
    const issues = identifyIssues(cityConfig, stats);

    // Target progress
    const targetProgress = {
        spots: {
            current: spotCount,
            min: cityConfig.targets.spots.min,
            ideal: cityConfig.targets.spots.ideal,
            percent: Math.round((spotCount / cityConfig.targets.spots.min) * 100),
        },
        templates: {
            current: templateCount,
            min: cityConfig.targets.templates.min,
            ideal: cityConfig.targets.templates.ideal,
            percent: Math.round((templateCount / cityConfig.targets.templates.min) * 100),
        },
    };

    return {
        timestamp: new Date().toISOString(),
        city: cityConfig,
        stats,
        quality,
        issues,
        targetProgress,
    };
}

function calculateQualityScores(
    city: CityConfig,
    stats: CityStats
): CityReport['quality'] {
    // Category balance (are all required categories present?)
    const categoriesPresent = REQUIRED_CATEGORIES.filter(
        cat => (stats.categoryDistribution[cat] || 0) > 0
    );
    const categoryBalance = Math.round((categoriesPresent.length / REQUIRED_CATEGORIES.length) * 100);

    // Localness balance (is distribution reasonable?)
    const total = Object.values(stats.localnessDistribution).reduce((a, b) => a + b, 0);
    let localnessScore = 100;
    if (total > 0) {
        // Check if distribution is roughly balanced (not all one category)
        const hiddenGems = (stats.localnessDistribution["Hidden Gem"] || 0) / total;
        const localFavorites = (stats.localnessDistribution["Local Favorite"] || 0) / total;
        const mixedCrowd = (stats.localnessDistribution["Mixed Crowd"] || 0) / total;

        // Penalize if too skewed
        if (hiddenGems < 0.1) localnessScore -= 20;
        if (localFavorites < 0.2) localnessScore -= 20;
        if (mixedCrowd > 0.6) localnessScore -= 20; // Too touristy
    }
    const localnessBalance = Math.max(0, localnessScore);

    // Neighborhood coverage
    const targetNeighborhoods = city.neighborhoods.length;
    const neighborhoodCoverage = targetNeighborhoods > 0
        ? Math.min(100, Math.round((stats.neighborhoodCoverage / targetNeighborhoods) * 100))
        : 50;

    // Image quality (inverse of missing rate)
    const imageQuality = 100 - stats.missingImageRate;

    // Overall score (weighted average)
    const overallScore = Math.round(
        categoryBalance * 0.25 +
        localnessBalance * 0.25 +
        neighborhoodCoverage * 0.25 +
        imageQuality * 0.25
    );

    return {
        overallScore,
        categoryBalance,
        localnessBalance,
        neighborhoodCoverage,
        imageQuality,
    };
}

function identifyIssues(
    city: CityConfig,
    stats: CityStats
): CityReport['issues'] {
    const critical: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Critical: Too few spots
    if (stats.spotCount < city.targets.spots.min * 0.25) {
        critical.push(`Only ${stats.spotCount} spots - need at least ${city.targets.spots.min}`);
    }

    // Critical: Missing major categories
    const missingCategories = REQUIRED_CATEGORIES.filter(
        cat => (stats.categoryDistribution[cat] || 0) === 0
    );
    if (missingCategories.length > 2) {
        critical.push(`Missing categories: ${missingCategories.join(", ")}`);
    }

    // Warning: Low spot count
    if (stats.spotCount < city.targets.spots.min) {
        warnings.push(`Below minimum spots target (${stats.spotCount}/${city.targets.spots.min})`);
    }

    // Warning: High missing image rate
    if (stats.missingImageRate > 20) {
        warnings.push(`${stats.missingImageRate}% of spots missing images`);
    }

    // Warning: Poor neighborhood coverage
    if (stats.neighborhoodCoverage < city.neighborhoods.length * 0.5) {
        warnings.push(`Only ${stats.neighborhoodCoverage} neighborhoods covered of ${city.neighborhoods.length} known`);
    }

    // Suggestions
    if (missingCategories.length > 0 && missingCategories.length <= 2) {
        suggestions.push(`Consider adding spots in: ${missingCategories.join(", ")}`);
    }

    const hasLegendary = (stats.localnessDistribution["Legendary Alley"] || 0) > 0;
    if (!hasLegendary) {
        suggestions.push("No 'Legendary Alley' spots - add some ultra-local finds");
    }

    if (stats.templateCount < city.targets.templates.min) {
        suggestions.push(`Add ${city.targets.templates.min - stats.templateCount} more templates`);
    }

    return { critical, warnings, suggestions };
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

function printReport(report: CityReport) {
    const { city, stats, quality, issues, targetProgress } = report;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`🏙️  ${city.name.toUpperCase()} (${city.emoji} ${city.country})`);
    console.log(`   Ring ${city.ring} ${city.ring === 1 ? "- Anchor" : city.ring === 2 ? "- Expansion" : "- Depth"}`);
    console.log(`${"═".repeat(60)}`);

    // Quality Score
    const scoreEmoji = quality.overallScore >= 80 ? "🟢" :
        quality.overallScore >= 60 ? "🟡" : "🔴";
    console.log(`\n${scoreEmoji} QUALITY SCORE: ${quality.overallScore}/100`);
    console.log(`   Category Balance:    ${quality.categoryBalance}%`);
    console.log(`   Localness Balance:   ${quality.localnessBalance}%`);
    console.log(`   Neighborhood Cover:  ${quality.neighborhoodCoverage}%`);
    console.log(`   Image Quality:       ${quality.imageQuality}%`);

    // Targets
    console.log(`\n🎯 TARGET PROGRESS`);
    const spotBar = createProgressBar(targetProgress.spots.percent);
    const templateBar = createProgressBar(targetProgress.templates.percent);
    console.log(`   Spots:     ${spotBar} ${targetProgress.spots.current}/${targetProgress.spots.min} (${targetProgress.spots.percent}%)`);
    console.log(`   Templates: ${templateBar} ${targetProgress.templates.current}/${targetProgress.templates.min} (${targetProgress.templates.percent}%)`);

    // Category Distribution
    console.log(`\n📊 CATEGORY DISTRIBUTION`);
    const sortedCats = Object.entries(stats.categoryDistribution)
        .sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sortedCats) {
        const pct = Math.round((count / stats.spotCount) * 100);
        const bar = createProgressBar(pct);
        console.log(`   ${cat.padEnd(12)} ${bar} ${count.toString().padStart(3)} (${pct}%)`);
    }

    // Localness Distribution
    console.log(`\n🎭 LOCALNESS DISTRIBUTION`);
    const sortedLocal = Object.entries(stats.localnessDistribution)
        .sort((a, b) => {
            const order = ["Legendary Alley", "Hidden Gem", "Local Favorite", "Mixed Crowd", "Tourist Friendly", "Tourist Trap"];
            return order.indexOf(a[0]) - order.indexOf(b[0]);
        });
    for (const [label, count] of sortedLocal) {
        const pct = Math.round((count / stats.spotCount) * 100);
        const bar = createProgressBar(pct);
        console.log(`   ${label.padEnd(18)} ${bar} ${count.toString().padStart(3)} (${pct}%)`);
    }

    // Issues
    if (issues.critical.length > 0) {
        console.log(`\n🔴 CRITICAL ISSUES`);
        for (const issue of issues.critical) {
            console.log(`   ❌ ${issue}`);
        }
    }
    if (issues.warnings.length > 0) {
        console.log(`\n🟡 WARNINGS`);
        for (const warning of issues.warnings) {
            console.log(`   ⚠️  ${warning}`);
        }
    }
    if (issues.suggestions.length > 0) {
        console.log(`\n💡 SUGGESTIONS`);
        for (const suggestion of issues.suggestions) {
            console.log(`   → ${suggestion}`);
        }
    }

    console.log(`\n${"─".repeat(60)}`);
}

function createProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return `[${"█".repeat(Math.min(filled, 10))}${"░".repeat(Math.max(empty, 0))}]`;
}

// ============================================
// MAIN
// ============================================

async function main() {
    const args = process.argv.slice(2);
    const citySlug = args.find(a => !a.startsWith("--"));
    const saveJson = args.includes("--json");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Missing Supabase credentials in .env.local");
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`\n${"╔".padEnd(59, "═")}╗`);
    console.log(`║${"LOCALLEY CITY QUALITY REPORT".padStart(40).padEnd(58)}║`);
    console.log(`${"╚".padEnd(59, "═")}╝`);
    console.log(`   Generated: ${new Date().toISOString()}`);

    // Determine which cities to analyze
    let citiesToAnalyze: CityConfig[];

    if (citySlug) {
        const city = getCityBySlug(citySlug);
        if (!city) {
            console.error(`❌ City not found: ${citySlug}`);
            console.log("   Available cities:");
            for (const c of ALL_CITIES) {
                console.log(`   - ${c.slug} (${c.name})`);
            }
            process.exit(1);
        }
        citiesToAnalyze = [city];
    } else {
        citiesToAnalyze = ENABLED_CITIES;
        console.log(`   Analyzing ${citiesToAnalyze.length} enabled cities...`);
    }

    const reports: CityReport[] = [];

    for (const city of citiesToAnalyze) {
        const report = await analyzeCity(supabase, city);
        reports.push(report);
        printReport(report);
    }

    // Summary if multiple cities
    if (reports.length > 1) {
        console.log(`\n${"═".repeat(60)}`);
        console.log(`📊 SUMMARY ACROSS ${reports.length} CITIES`);
        console.log(`${"═".repeat(60)}`);

        const totalSpots = reports.reduce((sum, r) => sum + r.stats.spotCount, 0);
        const avgQuality = Math.round(
            reports.reduce((sum, r) => sum + r.quality.overallScore, 0) / reports.length
        );

        console.log(`\n   Total Spots:    ${totalSpots}`);
        console.log(`   Avg Quality:    ${avgQuality}/100`);

        console.log(`\n   By City:`);
        for (const r of reports.sort((a, b) => b.stats.spotCount - a.stats.spotCount)) {
            const scoreEmoji = r.quality.overallScore >= 80 ? "🟢" :
                r.quality.overallScore >= 60 ? "🟡" : "🔴";
            console.log(`   ${scoreEmoji} ${r.city.name.padEnd(15)} ${r.stats.spotCount.toString().padStart(4)} spots  ${r.quality.overallScore}/100`);
        }
    }

    // Save JSON report
    if (saveJson) {
        const reportDir = path.join(process.cwd(), "reports");
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const filename = citySlug
            ? `quality_${citySlug}_${new Date().toISOString().split("T")[0]}.json`
            : `quality_all_${new Date().toISOString().split("T")[0]}.json`;

        const reportPath = path.join(reportDir, filename);
        fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
        console.log(`\n💾 JSON report saved: ${reportPath}`);
    }

    console.log();
}

main().catch(err => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
});
