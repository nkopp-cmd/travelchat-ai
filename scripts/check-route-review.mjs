/** Structural evidence check only. A human must inspect each current screenshot.
 * node scripts/check-route-review.mjs <private-receipt.json> <expected-source-sha>
 * Receipt: {source, previewUrl, reviews:[{route,width,reviewed,screenshot}]}.
 * Run from the repository root. Screenshot paths are relative to the receipt.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function pageRoutes(files) {
  return [...new Set(files.filter(file => /(?:^|\/)page\.[jt]sx?$/.test(file)).map(file => {
    const parts = file.replaceAll('\\', '/').split('/').slice(1, -1)
      .filter(part => !/^\(.*\)$/.test(part) && !part.startsWith('@') && !/^\[\[\.\.\..+\]\]$/.test(part));
    return '/' + parts.join('/');
  }))].sort();
}

export function reviewErrors(receipt, routes, source) {
  const errors = [];
  if (!/^[a-f0-9]{40}$/.test(source) || receipt.source !== source) errors.push('source mismatch');
  try {
    const url = new URL(receipt.previewUrl);
    if (url.protocol !== 'https:' || url.host !== 'localley-next-preview.nkopp.workers.dev' ||
        url.username || url.password || url.search || url.hash) errors.push('invalid preview URL');
  } catch { errors.push('missing preview URL'); }
  const reviews = Array.isArray(receipt.reviews) ? receipt.reviews : [];
  for (const route of routes) for (const width of [390, 1440]) {
    const cases = reviews.filter(row => row.route === route && row.width === width);
    if (cases.length !== 1 || cases[0].reviewed !== true ||
        typeof cases[0].screenshot !== 'string' || !cases[0].screenshot.endsWith('.png'))
      errors.push(`${route} ${width}: needs one inspected PNG`);
  }
  for (const row of reviews) if (!routes.includes(row.route) || ![390, 1440].includes(row.width))
    errors.push('unknown route or width');
  if (new Set(reviews.map(row => row.screenshot)).size !== reviews.length)
    errors.push('screenshots must be distinct');
  return errors;
}

async function pages(dir) {
  const groups = await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? pages(name) : [name];
  }));
  return groups.flat();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [receiptPath, source] = process.argv.slice(2);
  if (!receiptPath || !source) throw new Error('Expected private receipt path and source SHA');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const routes = pageRoutes(await pages('app'));
  const errors = reviewErrors(receipt, routes, source);
  for (const row of receipt.reviews || []) {
    if (typeof row.screenshot !== 'string') continue;
    try {
      const bytes = await readFile(path.resolve(path.dirname(receiptPath), row.screenshot));
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          bytes.length < 24 || bytes.readUInt32BE(16) !== row.width)
        errors.push(`${row.route} ${row.width}: invalid PNG or width`);
    } catch { errors.push(`${row.route} ${row.width}: missing image`); }
  }
  console.log(`${routes.length} routes, ${routes.length * 2} required reviews; ${errors.length} errors.`);
  for (const error of errors) console.error(error);
  process.exitCode = errors.length ? 1 : 0;
}
