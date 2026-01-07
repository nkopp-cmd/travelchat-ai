/**
 * Template Import Script
 *
 * Imports city-specific itinerary templates from JSON files.
 * Templates are stored in lib/templates.ts but this allows
 * importing additional city-specific templates.
 *
 * Usage:
 *   npx tsx scripts/import-templates.ts <json-file> [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCityBySlug, getCityByName, CityConfig } from '../lib/cities';

// ============================================
// TYPES
// ============================================

export interface TemplateInput {
    id?: string;
    name: string;
    description: string;
    city: string;
    days: number;
    pace: 'relaxed' | 'moderate' | 'active';
    focus: string[];
    activitiesPerDay: number;
    targetAudience: string;
    prompt: string;
    tags: string[];
    emoji?: string;
    color?: string;
    icon?: string;
}

interface ImportReport {
    timestamp: string;
    city: string;
    source: string;
    dryRun: boolean;
    summary: {
        totalInput: number;
        valid: number;
        invalid: number;
    };
    templates: Array<{
        id: string;
        name: string;
        days: number;
        pace: string;
    }>;
    issues: string[];
}

// ============================================
// VALIDATION
// ============================================

function validateTemplate(template: TemplateInput): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!template.name || template.name.length < 3) {
        issues.push("Name is required (min 3 chars)");
    }
    if (!template.description || template.description.length < 20) {
        issues.push("Description is required (min 20 chars)");
    }
    if (!template.days || template.days < 1 || template.days > 14) {
        issues.push("Days must be between 1-14");
    }
    if (!['relaxed', 'moderate', 'active'].includes(template.pace)) {
        issues.push("Pace must be relaxed, moderate, or active");
    }
    if (!template.focus || template.focus.length === 0) {
        issues.push("At least one focus area required");
    }
    if (!template.targetAudience) {
        issues.push("Target audience is required");
    }
    if (!template.prompt || template.prompt.length < 50) {
        issues.push("Prompt is required (min 50 chars)");
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

function generateTemplateId(name: string, city: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${city.toLowerCase()}-${slug}`;
}

// Default colors by pace
const PACE_COLORS: Record<string, string> = {
    relaxed: 'from-emerald-500 to-teal-500',
    moderate: 'from-blue-500 to-indigo-500',
    active: 'from-orange-500 to-red-500',
};

// ============================================
// MAIN
// ============================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes("--help")) {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║            LOCALLEY TEMPLATE IMPORT TOOL                   ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    npx tsx scripts/import-templates.ts <json> [options]    ║
║                                                            ║
║  Options:                                                  ║
║    --dry-run    Validate without saving                    ║
║    --city=slug  Override city detection                    ║
║    --output     Output TypeScript code to add to templates ║
║                                                            ║
║  Example:                                                  ║
║    npx tsx scripts/import-templates.ts data/osaka-templates.json ║
╚════════════════════════════════════════════════════════════╝
        `);
        process.exit(0);
    }

    const jsonFile = args.find(a => !a.startsWith("--"));
    const dryRun = args.includes("--dry-run");
    const outputCode = args.includes("--output");
    const cityOverride = args.find(a => a.startsWith("--city="))?.split("=")[1];

    if (!jsonFile) {
        console.error("❌ No JSON file specified");
        process.exit(1);
    }

    const filePath = path.resolve(process.cwd(), jsonFile);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`\n🗺️  LOCALLEY TEMPLATE IMPORT`);
    console.log(`${"─".repeat(50)}`);
    console.log(`📁 Source: ${jsonFile}`);
    console.log(`🔧 Mode: ${dryRun ? "DRY RUN" : "VALIDATION"}`);

    const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const templates: TemplateInput[] = Array.isArray(rawData) ? rawData : rawData.templates || [];

    if (templates.length === 0) {
        console.error("❌ No templates found in JSON file");
        process.exit(1);
    }

    // Detect city
    let cityConfig: CityConfig | undefined;

    if (cityOverride) {
        cityConfig = getCityBySlug(cityOverride);
    } else if (templates[0].city) {
        cityConfig = getCityByName(templates[0].city) || getCityBySlug(templates[0].city);
    }

    if (!cityConfig) {
        console.error("❌ Could not detect city. Use --city=slug or include 'city' in templates.");
        process.exit(1);
    }

    console.log(`🏙️  City: ${cityConfig.name} (Ring ${cityConfig.ring})`);
    console.log(`📊 Templates in file: ${templates.length}`);
    console.log(`${"─".repeat(50)}\n`);

    // Process templates
    const report: ImportReport = {
        timestamp: new Date().toISOString(),
        city: cityConfig.name,
        source: jsonFile,
        dryRun,
        summary: {
            totalInput: templates.length,
            valid: 0,
            invalid: 0,
        },
        templates: [],
        issues: [],
    };

    const processedTemplates: TemplateInput[] = [];

    for (const template of templates) {
        const validation = validateTemplate(template);

        if (!validation.valid) {
            report.summary.invalid++;
            report.issues.push(`${template.name}: ${validation.issues.join(", ")}`);
            continue;
        }

        // Generate ID if not provided
        const id = template.id || generateTemplateId(template.name, cityConfig.slug);

        const processed: TemplateInput = {
            ...template,
            id,
            city: cityConfig.name,
            emoji: template.emoji || '📍',
            icon: template.icon || template.emoji || '📍',
            color: template.color || PACE_COLORS[template.pace] || PACE_COLORS.moderate,
        };

        processedTemplates.push(processed);
        report.summary.valid++;
        report.templates.push({
            id,
            name: template.name,
            days: template.days,
            pace: template.pace,
        });
    }

    // Print results
    console.log(`\n${"═".repeat(50)}`);
    console.log(`📋 TEMPLATE IMPORT REPORT: ${cityConfig.name}`);
    console.log(`${"═".repeat(50)}`);

    console.log(`\n📈 SUMMARY`);
    console.log(`   Total Input:  ${report.summary.totalInput}`);
    console.log(`   ✅ Valid:     ${report.summary.valid}`);
    console.log(`   ❌ Invalid:   ${report.summary.invalid}`);

    console.log(`\n📝 VALID TEMPLATES`);
    for (const t of report.templates) {
        console.log(`   ${t.id}`);
        console.log(`      ${t.name} (${t.days} days, ${t.pace})`);
    }

    if (report.issues.length > 0) {
        console.log(`\n⚠️  ISSUES`);
        for (const issue of report.issues) {
            console.log(`   - ${issue}`);
        }
    }

    // Output TypeScript code
    if (outputCode && processedTemplates.length > 0) {
        console.log(`\n📝 TYPESCRIPT CODE (add to lib/templates.ts):`);
        console.log(`${"─".repeat(50)}`);

        for (const t of processedTemplates) {
            console.log(`  {
    id: '${t.id}',
    name: '${t.name}',
    description: '${t.description.replace(/'/g, "\\'")}',
    icon: '${t.icon}',
    emoji: '${t.emoji}',
    days: ${t.days},
    pace: '${t.pace}',
    focus: ${JSON.stringify(t.focus)},
    activitiesPerDay: ${t.activitiesPerDay},
    targetAudience: '${t.targetAudience}',
    prompt: \`${t.prompt}\`,
    tags: ${JSON.stringify(t.tags)},
    color: '${t.color}',
  },`);
        }
    }

    // Save report
    const reportDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportName = `templates_${cityConfig.slug}_${new Date().toISOString().split("T")[0]}.json`;
    const reportPath = path.join(reportDir, reportName);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n💾 Report saved: ${reportPath}`);
    console.log(`${"═".repeat(50)}\n`);

    // Target check
    console.log(`🎯 TARGET CHECK`);
    const currentCount = report.summary.valid; // Would need to count existing in real scenario
    const target = cityConfig.targets.templates;
    console.log(`   City needs: ${target.min}-${target.ideal} templates`);
    console.log(`   This import: ${report.summary.valid} templates`);

    if (report.summary.valid < target.min) {
        console.log(`   ⚠️  Need ${target.min - report.summary.valid} more templates to reach minimum`);
    } else {
        console.log(`   ✅ Minimum target met!`);
    }

    console.log();
}

main().catch(err => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
});
