// Run: node --import tsx scripts/native-social-review.mjs --dry-run --live [--spots FILE] [--manifest FILE] [--out FILE]
// No database client, publication endpoint, scheduler, source scraping, or paid provider is imported here.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { reviewNativeSocial, NATIVE_SOCIAL_VERSION } from '../lib/native-social-trends.ts';

export const NATIVE_STAGED_URL = 'http://100.112.156.12:3010/api/localley/staged';
const MAX_BYTES = 8 * 1024 * 1024;

export async function readNativeSocialFeed(fetcher = fetch) {
  const records = [], discoveryLeads = [], socialSources = [];
  let offset = 0, socialOffset = 0, recordDone = false, socialDone = false, bytes = 0;
  for (let page = 0; page < 51; page++) {
    const url = new URL(NATIVE_STAGED_URL);
    url.search = new URLSearchParams({ city: 'seoul', limit: '100', offset: String(offset), socialOffset: String(socialOffset) }).toString();
    const response = await fetcher(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || !response.body) throw new Error(`Private staged feed HTTP ${response.status}`);
    const reader = response.body.getReader(), chunks = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Feed byte bound exceeded');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (body.publicationReady !== false || body.socialEvidenceVersion !== NATIVE_SOCIAL_VERSION
      || !Array.isArray(body.records) || body.records.length > 100
      || !Array.isArray(body.discoveryLeads) || !Array.isArray(body.socialSources)
      || body.discoveryLeads.length + body.socialSources.length > 100) throw new Error('Unsupported staged feed contract');
    const advance = (next, current) => {
      if (next === null) return null;
      if (!Number.isSafeInteger(next) || next <= current || next > 5000) throw new Error('Invalid staged cursor');
      return next;
    };
    // The endpoint cannot disable one stream. Freeze its cursor and ignore its repeated last page once exhausted.
    if (!recordDone) {
      records.push(...body.records);
      const next = advance(body.nextOffset, offset);
      if (next === null) recordDone = true; else offset = next;
    }
    if (!socialDone) {
      discoveryLeads.push(...body.discoveryLeads); socialSources.push(...body.socialSources);
      const next = advance(body.nextSocialOffset, socialOffset);
      if (next === null) socialDone = true; else socialOffset = next;
    }
    if (records.length + discoveryLeads.length + socialSources.length > 5000) throw new Error('Feed record bound exceeded');
    if (recordDone && socialDone) return { records, discoveryLeads, socialSources, sourceBytes: bytes, pages: page + 1,
      publicationReady: false, socialEvidenceVersion: NATIVE_SOCIAL_VERSION };
  }
  throw new Error('Feed page bound exceeded; no partial ranking review');
}

export function parseNativeSocialArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (Object.hasOwn(values, arg)) throw new Error('Duplicate option');
    if (['--dry-run', '--live'].includes(arg)) values[arg] = true;
    else if (['--input', '--spots', '--manifest', '--out'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) values[arg] = args[++i];
    else throw new Error('Only --dry-run (--live | --input FILE) [--spots FILE] [--manifest FILE] [--out FILE] is supported');
  }
  if (!values['--dry-run'] || Boolean(values['--live']) === Boolean(values['--input'])) throw new Error('Explicit dry-run and one input source required');
  return values;
}

export async function main(args = process.argv.slice(2)) {
  const values = parseNativeSocialArgs(args);
  const load = file => {
    if (!statSync(file).isFile() || statSync(file).size > MAX_BYTES) throw new Error('Invalid input file');
    const raw = readFileSync(file);
    if (raw.length > MAX_BYTES) throw new Error('Input byte bound exceeded');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  };
  const feed = values['--live'] ? await readNativeSocialFeed() : load(values['--input']);
  if (feed.publicationReady !== false || feed.socialEvidenceVersion !== NATIVE_SOCIAL_VERSION) throw new Error('Private versioned input required');
  const spots = values['--spots'] ? load(values['--spots']) : [];
  // Do not read a manifest, approved boolean, or existingSpots from the untrusted feed body.
  const manifest = values['--manifest'] ? load(values['--manifest']) : undefined;
  const report = reviewNativeSocial(feed, spots, manifest);
  if (values['--out']) writeFileSync(values['--out'], JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, publicationReady: false, applied: false,
    publicRankingsAction: report.publicRankingsAction, counts: report.counts, rejectionReasons: report.rejectionReasons,
    pages: feed.pages, sourceBytes: feed.sourceBytes, paidProviderCalls: 0 }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ status: 'unready', publicationReady: false, applied: false,
      publicRankingsAction: 'unchanged', counts: { acceptedPosts: 0, ranks: 0 },
      rejectionReasons: { feed_or_input_validation_failed: 1 }, rankings: [], paidProviderCalls: 0,
      error: 'Dry-run failed closed. Check private feed contract, input, and trusted review bindings. Counts describe this failed run, not source coverage.' }));
    process.exitCode = 1;
  });
}
