/**
 * Export a timestamped, read-only spot readiness packet.
 *
 * This wraps the focused photo, location, and action-plan audits so operators
 * can produce one review folder before manual enrichment or backfill work.
 *
 * Usage:
 *   npx tsx scripts/export-spot-readiness-packet.ts
 *   npx tsx scripts/export-spot-readiness-packet.ts --city=Tokyo --limit=120
 *   npx tsx scripts/export-spot-readiness-packet.ts --out-dir=reports/spot-readiness/manual
 */

import { spawnSync } from "child_process";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local", quiet: true });

const DEFAULT_LIMIT = 250;
const DEFAULT_SAMPLE_LIMIT = 80;

interface Args {
    city?: string;
    limit: number;
    sampleLimit: number;
    outDir: string;
    verbose: boolean;
    help: boolean;
}

interface AuditStatus {
    name: string;
    command: string;
    outPath: string;
    ok: boolean;
    exitCode: number | null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function getArgValue(argv: string[], name: string): string | undefined {
    const arg = argv.find((value) => value.startsWith(`${name}=`));
    return arg ? arg.slice(name.length + 1).trim() : undefined;
}

function getTimestampSlug(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv: string[]): Args {
    const outDir = getArgValue(argv, "--out-dir") || `reports/spot-readiness-${getTimestampSlug()}`;

    return {
        help: argv.includes("--help") || argv.includes("-h"),
        city: getArgValue(argv, "--city"),
        limit: parsePositiveInt(getArgValue(argv, "--limit"), DEFAULT_LIMIT),
        sampleLimit: parsePositiveInt(getArgValue(argv, "--sample-limit"), DEFAULT_SAMPLE_LIMIT),
        outDir,
        verbose: argv.includes("--verbose"),
    };
}

function printHelp() {
    console.log(`Export a read-only Localley spot readiness packet.

Usage:
  npm run spots:readiness
  npm run spots:readiness -- --city=Tokyo --limit=120
  npm run spots:readiness -- --out-dir=reports/spot-readiness/manual

Options:
  --city=<name>          Restrict audits to spots whose English address contains the city.
  --limit=<n>            Number of prioritized action-plan rows to export. Default: ${DEFAULT_LIMIT}.
  --sample-limit=<n>     Number of audit sample rows to include. Default: ${DEFAULT_SAMPLE_LIMIT}.
  --out-dir=<path>       Output folder. Default: reports/spot-readiness-<timestamp>.
  --verbose              Print child audit output while the packet runs.
  --help, -h             Show this help text.
`);
}

function assertSupabaseCredentials() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!url || !key) {
        throw new Error(
            "Missing Supabase credentials. Pull production env first or set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        );
    }
}

function getOutputTail(output: string): string {
    return output
        .trim()
        .split("\n")
        .slice(-20)
        .join("\n");
}

function runAudit(
    name: string,
    scriptPath: string,
    args: string[],
    outPath: string,
    verbose: boolean
): AuditStatus {
    const commandArgs = ["tsx", scriptPath, ...args];
    const result = spawnSync("npx", commandArgs, {
        stdio: verbose ? "inherit" : "pipe",
        encoding: "utf8",
        env: process.env,
    });

    if (!verbose && result.status !== 0) {
        const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
        const tail = getOutputTail(output);
        if (tail) {
            console.error(`${name} failed. Output tail:\n${tail}`);
        }
    }

    return {
        name,
        command: ["npx", ...commandArgs].join(" "),
        outPath,
        ok: result.status === 0,
        exitCode: result.status,
    };
}

function readJsonSummary(filePath: string): unknown {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    assertSupabaseCredentials();

    const outDir = path.resolve(args.outDir);
    fs.mkdirSync(outDir, { recursive: true });

    const commonCityArg = args.city ? [`--city=${args.city}`] : [];
    const photoPath = path.join(outDir, "photo-coverage.json");
    const locationPath = path.join(outDir, "location-quality.json");
    const actionPlanPath = path.join(outDir, "action-plan.json");
    const actionPlanCsvPath = path.join(outDir, "action-plan.csv");

    const audits: AuditStatus[] = [];
    audits.push(
        runAudit(
            "photoCoverage",
            "scripts/audit-spot-photo-coverage.ts",
            [...commonCityArg, `--sample-limit=${args.sampleLimit}`, `--out=${photoPath}`],
            photoPath,
            args.verbose
        )
    );
    audits.push(
        runAudit(
            "locationQuality",
            "scripts/audit-spot-location-quality.ts",
            [...commonCityArg, `--sample-limit=${args.sampleLimit}`, `--out=${locationPath}`],
            locationPath,
            args.verbose
        )
    );
    audits.push(
        runAudit(
            "actionPlan",
            "scripts/export-spot-quality-action-plan.ts",
            [
                ...commonCityArg,
                `--limit=${args.limit}`,
                `--out=${actionPlanPath}`,
                `--csv=${actionPlanCsvPath}`,
            ],
            actionPlanPath,
            args.verbose
        )
    );

    const manifest = {
        generatedAt: new Date().toISOString(),
        filters: {
            city: args.city || null,
            limit: args.limit,
            sampleLimit: args.sampleLimit,
        },
        outDir,
        ok: audits.every((audit) => audit.ok),
        audits,
        reports: {
            photoCoverage: photoPath,
            locationQuality: locationPath,
            actionPlan: actionPlanPath,
            actionPlanCsv: actionPlanCsvPath,
        },
        summaries: {
            photoCoverage: readJsonSummary(photoPath),
            locationQuality: readJsonSummary(locationPath),
            actionPlan: readJsonSummary(actionPlanPath),
        },
        nextSteps: [
            "Apply supabase/migrations/006_spots_google_place_id.sql if actionPlan.schema.migrationRequired is true.",
            "Review action-plan.csv from highest priority downward in /admin/spots/quality.",
            "Run scripts/review-spot-photo-backfill.ts in dry-run mode for high-confidence missing-photo candidates.",
            "Run scripts/review-spot-location-backfill.ts in dry-run mode for weak direction records.",
            "Re-run this readiness packet and confirm missingRealPhoto, inexactLocation, and missingPlaceId counts decrease.",
        ],
    };

    const manifestPath = path.join(outDir, "manifest.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(
        [
            `Spot readiness packet written to ${outDir}`,
            `Manifest: ${manifestPath}`,
            `Status: ${manifest.ok ? "ok" : "failed"}`,
        ].join("\n")
    );

    if (!manifest.ok) process.exit(1);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
