// Read-only audit of a private source snapshot and staged story media.
// This reports inventory coverage, not an import, remote R2 verification, or a cutover approval.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE = 'https://llehrhqeolfprutcaopi.supabase.co';
export const IMPORTED = new Set(['users', 'spots', 'itineraries', 'conversations', 'messages', 'subscriptions', 'usage_tracking']);
export const ARCHIVED = new Set(['affiliate_clicks', 'affiliate_earnings', 'apify_spot_candidates', 'apify_spot_discovery_runs', 'challenges',
  'content_engagement', 'contribution_token_ledger', 'early_adopters', 'follows', 'geo_aliases', 'geo_countries', 'geo_destinations',
  'geo_local_area_vibe_scores', 'geo_local_areas', 'geo_vibe_taxonomy', 'guide_earnings', 'guide_profiles', 'review_helpful_votes',
  'saved_itineraries', 'saved_spots', 'social_spot_submission_aliases', 'social_spot_submission_candidates', 'social_spot_submission_media',
  'social_spot_submission_media_jobs', 'social_spot_submissions', 'spot_contributors', 'spot_reviews', 'story_image_jobs', 'transfer_edges',
  'trip_activities', 'trip_days', 'trip_stops', 'trip_transfer_legs', 'trips', 'user_challenges', 'user_progress', 'weekly_city_spot_rankings',
  'weekly_social_content', 'weekly_social_spot_leads', 'weekly_social_trend_city_builds', 'weekly_social_trend_runs']);

export async function reconcileArchive(snapshotDir, mediaDir) {
  const snapshotBytes = await readFile(join(snapshotDir, 'manifest.json'));
  const snapshot = JSON.parse(snapshotBytes);
  if (snapshot.version !== 1 || snapshot.complete !== true || snapshot.source !== SOURCE || !Array.isArray(snapshot.tables)) throw new Error('invalid_snapshot');
  if (digest(await readFile(join(snapshotDir, 'schema.json'))) !== snapshot.schemaSha256) throw new Error('schema_hash_mismatch');
  const names = new Set();
  const counts = { importedSourceTables: 0, archivedSourceTables: 0, importedSourceRows: 0, archivedSourceRows: 0 };
  for (const table of snapshot.tables) {
    if (!table || typeof table.name !== 'string' || names.has(table.name) || !IMPORTED.has(table.name) && !ARCHIVED.has(table.name)) throw new Error('unclassified_or_duplicate_table');
    names.add(table.name);
    if (!Number.isSafeInteger(table.count) || table.count < 0 || !Array.isArray(table.primaryKey) || !table.primaryKey.length || !Array.isArray(table.pages) || !table.pages.length) throw new Error('invalid_table');
    let total = 0;
    const keys = new Set();
    for (const [index, page] of table.pages.entries()) {
      if (page.file !== `${table.name}-${index}.json` || !Number.isSafeInteger(page.rows) || page.rows < 0) throw new Error('invalid_page');
      const bytes = await readFile(join(snapshotDir, page.file));
      if (digest(bytes) !== page.sha256) throw new Error('page_hash_mismatch');
      const rows = JSON.parse(bytes);
      if (!Array.isArray(rows) || rows.length !== page.rows) throw new Error('page_count_mismatch');
      for (const row of rows) {
        const parts = table.primaryKey.map(key => row?.[key]);
        if (parts.some(part => part == null)) throw new Error('missing_primary_key');
        const id = JSON.stringify(parts);
        if (keys.has(id)) throw new Error('duplicate_primary_key');
        keys.add(id);
      }
      total += rows.length;
    }
    if (total !== table.count) throw new Error('table_count_mismatch');
    const kind = IMPORTED.has(table.name) ? 'imported' : 'archived';
    counts[`${kind}SourceTables`]++;
    counts[`${kind}SourceRows`] += total;
  }
  if (names.size !== IMPORTED.size + ARCHIVED.size) throw new Error('missing_source_table');

  const media = JSON.parse(await readFile(join(mediaDir, 'manifest.json')));
  if (media.version !== 1 || media.complete !== true || media.kind !== 'legacy_story_media' || media.bucket !== 'localley-legacy-media' || media.jurisdiction !== 'eu' || !Array.isArray(media.objects) || !Array.isArray(media.references) || !Array.isArray(media.unresolved) || media.unresolved.length) throw new Error('invalid_media_manifest');
  const objectKeys = new Set();
  for (const object of media.objects) {
    if (!/^[a-f0-9]{64}$/.test(object.sha256) || !['image/png', 'image/jpeg'].includes(object.contentType)) throw new Error('invalid_media_object');
    const extension = object.contentType === 'image/png' ? 'png' : 'jpg';
    if (object.key !== `legacy/${object.sha256}.${extension}` || object.file !== `objects/${object.sha256}.${extension}` || objectKeys.has(object.key)) throw new Error('invalid_media_key');
    objectKeys.add(object.key);
    const bytes = await readFile(join(mediaDir, object.file));
    if (bytes.length !== object.bytes || digest(bytes) !== object.sha256) throw new Error('media_hash_mismatch');
    if (object.contentType === 'image/png' ? !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) : !bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) throw new Error('media_format_mismatch');
  }
  for (const reference of media.references) if (!objectKeys.has(reference.key)) throw new Error('missing_media_reference');
  // A past receipt is not a current remote R2 read. Its status is reported separately.
  const receipt = JSON.parse(await readFile(join(mediaDir, 'r2-receipt.json')));
  const reconciliation = JSON.parse(await readFile(join(mediaDir, 'r2-reconciliation.json')));
  const remoteEvidence = new Set(receipt.verified ?? []);
  if (reconciliation.complete === true && reconciliation.uncertainUploadReconciledWithoutRetry?.verified === true) remoteEvidence.add(reconciliation.uncertainUploadReconciledWithoutRetry.sha256);
  if (receipt.bucket !== media.bucket || receipt.jurisdiction !== media.jurisdiction || remoteEvidence.size !== media.objects.length || !media.objects.every(o => remoteEvidence.has(o.sha256)) || reconciliation.totalVerified !== remoteEvidence.size) throw new Error('historical_remote_receipt_mismatch');
  return { snapshotManifestSha256: digest(snapshotBytes), ...counts, sourceTables: names.size, sourceRows: counts.importedSourceRows + counts.archivedSourceRows,
    localMediaObjectsVerified: objectKeys.size, mediaReferences: media.references.length, historicalRemoteReceiptObjects: remoteEvidence.size,
    currentRemoteR2Verified: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--snapshot' || args[2] !== '--media') throw new Error('usage: reconcile-archive.mjs --snapshot PRIVATE_DIR --media PRIVATE_DIR');
  reconcileArchive(resolve(args[1]), resolve(args[3])).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Archive reconciliation failed; no data writes were attempted.'); process.exitCode = 1;
  });
}
