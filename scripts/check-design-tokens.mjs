// Design-token ratchet (localley-design-consistency.md "Guard"). Counts legacy styling per file in
// app/** and components/** and fails when a file goes above its recorded count, or a file outside
// the baseline uses any. Counts only fall: run with --update after a cleanup to lower the baseline.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const LEGACY = {
  // Coloured gradient stops. A dark scrim (from-black/..) over a photo keeps text readable and is allowed.
  gradient: /\b(?:from|via|to)-(?:violet|indigo|purple|pink|blue|amber|emerald|rose|fuchsia|cyan|teal|orange|yellow|green|red|sky|lime|slate|gray|zinc)-\d/g,
  'raw-hex': /\b(?:bg|text|from|to|via|shadow|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g,
  'white-alpha': /\b(?:bg|text)-white\/(?:\d|\[)/g,
  palette: /\b(?:bg|text|fill|stroke)-(?:violet|indigo|purple|gray|slate|zinc|amber|emerald|blue|pink|rose|red|green|yellow|orange|teal|cyan|sky|lime|fuchsia|stone|neutral)-\d{2,3}\b/g,
  'tiny-text': /\btext-\[(?:9|10|11)px\]/g,
  'colored-shadow': /\bshadow-(?:violet|indigo|purple|pink|blue|amber|emerald)-\d+/g,
  'gradient-text': /\bbg-clip-text\b/g,
};

/**
 * Files that may keep a category for accessibility or third-party brand reasons, with the reason:
 * { 'components/x.tsx': { palette: 'why' } }. Everything else ratchets to zero. None are needed yet:
 * focus rings and status colours use the --ll-focus / --ll-success / --ll-warning / --ll-error tokens.
 */
export const EXCEPTIONS = {};

const ROOTS = ['app', 'components'];
const SKIP = /(?:^|\/)(?:__tests__|__recovery-visual|recovery-visual-fixture)(?:\/|$)|\.test\.tsx?$/;

export function countLegacy(source) {
  const counts = {};
  for (const [name, pattern] of Object.entries(LEGACY)) {
    const found = source.match(pattern)?.length ?? 0;
    if (found) counts[name] = found;
  }
  return counts;
}

/** Rows where a file exceeds its allowance (baseline count, or zero for a new file). */
export function regressions(current, baseline, exceptions = EXCEPTIONS) {
  const rows = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const [name, count] of Object.entries(counts)) {
      if (exceptions[file]?.[name]) continue;
      const allowed = baseline[file]?.[name] ?? 0;
      if (count > allowed) rows.push({ file, name, count, allowed });
    }
  }
  return rows;
}

async function walk(dir, root, out) {
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (SKIP.test(rel)) continue;
    if (entry.isDirectory()) await walk(rel, root, out);
    else if (/\.(?:tsx|ts)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

export async function scan(root) {
  const files = [];
  for (const dir of ROOTS) await walk(dir, root, files);
  const current = {};
  for (const file of files.sort()) {
    const counts = countLegacy(await readFile(path.join(root, file), 'utf8'));
    if (Object.keys(counts).length) current[file] = counts;
  }
  return current;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const baselinePath = path.join(root, 'scripts/design-token-baseline.json');
  const current = await scan(root);
  if (process.argv.includes('--update')) {
    await writeFile(baselinePath, JSON.stringify(current, null, 2) + '\n');
    console.log(`design-token baseline written: ${Object.keys(current).length} files`);
    process.exit(0);
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const bad = regressions(current, baseline);
  const total = (map) => Object.values(map).reduce((sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0), 0);
  if (bad.length) {
    for (const row of bad) console.error(`${row.file}: ${row.name} ${row.count} > allowed ${row.allowed}`);
    console.error('Use the design tokens (bg-surface, bg-raised, text-foreground, text-muted-foreground, bg-primary, --ll-* semantic colours) and shared components (PageHeader, PageEyebrow, PageShell).');
    process.exit(1);
  }
  const now = total(current), was = total(baseline);
  console.log(`design-token guard PASS: ${now} legacy uses (baseline ${was})${now < was ? '; run node scripts/check-design-tokens.mjs --update to lower the baseline' : ''}`);
}
