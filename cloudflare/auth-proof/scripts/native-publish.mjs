// Build a preview-only publication statement from checked-in identity and image review.
// Unknown-rights source gallery images never enter the public catalog.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const json = value => quote(JSON.stringify(value));
const root = new URL('../', import.meta.url);
export function publicationSql(review) {
  if (!/^[a-f0-9-]{36}$/.test(review.id) || !/^visit-seoul:\d+$/.test(review.providerPlaceId)
    || review.legacyMapping?.status !== 'new_preview_only' || review.category !== 'culture') throw new Error('Unsupported reviewed place');
  const source = new URL(review.sourceUrl);
  if (source.origin !== 'https://english.visitseoul.net' || source.search || source.hash) throw new Error('Invalid reviewed source');
  const asset = `/pilot/${review.id}.jpg`;
  if (JSON.stringify(review.photos) !== JSON.stringify([asset]) || review.photoCredits?.length !== 1) throw new Error('One reviewed image required');
  const credit = review.photoCredits[0];
  if (credit.url !== asset || !credit.author || credit.license !== 'CC BY-SA 3.0'
    || credit.licenseUrl !== 'https://creativecommons.org/licenses/by-sa/3.0/'
    || !credit.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:')) throw new Error('Unsupported image license review');
  const bytes = readFileSync(new URL(`pilot/images/${review.id}.jpg`, root));
  if (createHash('sha256').update(bytes).digest('hex') !== review.imageSha256) throw new Error('Reviewed image bytes changed');
  if (!review.description?.en || review.description.en.length > 500 || !review.name?.en) throw new Error('Reviewed factual copy required');
  for (const value of [review.latitude,review.longitude]) if (!Number.isFinite(value)) throw new Error('Reviewed coordinates required');
  const key = quote(`english.visitseoul.net:${review.providerPlaceId}`);
  return `-- Preview-only. Insert only the reviewed native observation; never overwrite an existing spot.
INSERT INTO spots(id,name,description,category,localley_score,photos,visible,city,address,latitude,longitude,photo_credits,source_urls)
SELECT ${quote(review.id)},${json(review.name)},${json(review.description)},${quote(review.category)},NULL,${json(review.photos)},1,'Seoul',${quote(review.address)},${review.latitude},${review.longitude},${json(review.photoCredits)},${json(review.sourceUrls)}
FROM native_place_candidates c WHERE c.source_key=${key} AND c.source_url=${quote(review.sourceUrl)}
AND json_extract(c.payload,'$.name.en')=${quote(review.name.en)}
AND json_extract(c.payload,'$.address.en')=${quote(review.address)}
AND json_extract(c.payload,'$.latitude')=${review.latitude} AND json_extract(c.payload,'$.longitude')=${review.longitude}
AND c.match_state='unmatched' AND c.matched_spot_id IS NULL
AND NOT EXISTS(SELECT 1 FROM spots s,json_each(COALESCE(s.source_urls,'[]')) u WHERE u.value=${quote(review.sourceUrl)})
ON CONFLICT(id) DO NOTHING;
UPDATE native_place_candidates SET matched_spot_id=${quote(review.id)},match_state='exact_source'
WHERE source_key=${key} AND EXISTS(SELECT 1 FROM spots WHERE id=${quote(review.id)} AND source_urls=${json(review.sourceUrls)});
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output,...extra]=process.argv.slice(2);
  if (!output || extra.length) throw new Error('Usage: node scripts/native-publish.mjs OUTPUT.sql');
  const review=JSON.parse(readFileSync(new URL('pilot/native-reviewed.json',root),'utf8'));
  if (!Array.isArray(review.spots) || review.spots.length > 20) throw new Error('Bounded review required');
  writeFileSync(output,review.spots.map(publicationSql).join('\n'),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({reviewedPlaces:review.spots.length,target:'Localley preview only'}));
}
