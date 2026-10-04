// Validate catalog health without retaining upstream text, names, addresses or URLs.
const invalid = reason => ({ usable: false, reason });

export function summarizeCityCatalog(body) {
  if (!body || body.success !== true || !Array.isArray(body.cities)
    || body.cities.length > 1000 || body.total !== body.cities.length) return invalid('invalid_catalog');
  const slugs = new Set(); let visibleCities = 0, totalSpots = 0;
  for (const city of body.cities) {
    if (!city || typeof city.slug !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(city.slug)
      || slugs.has(city.slug) || !Number.isSafeInteger(city.spotCount) || city.spotCount < 0)
      return invalid('invalid_catalog');
    slugs.add(city.slug);
    // These status thresholds are the checked production /api/cities contract.
    const expected = city.spotCount >= 150 ? 'recommended' : city.spotCount >= 60 ? 'available'
      : city.spotCount >= 1 ? 'beta' : 'hidden';
    if (city.status !== expected) return invalid('invalid_catalog');
    totalSpots += city.spotCount;
    if (!Number.isSafeInteger(totalSpots)) return invalid('invalid_catalog');
    if (city.status !== 'hidden') visibleCities++;
  }
  if (!visibleCities || !totalSpots) return invalid('empty_catalog');
  return { usable: true, cityCount: body.cities.length, visibleCities, totalSpots,
    scope: 'response_content_only', limitation: 'partial_source_failures_and_row_parity_not_proven' };
}

export async function checkCityCatalog(response) {
  const reader = response.body?.getReader();
  if (!reader) return invalid('catalog_unavailable');
  try {
    if (response.status !== 200) return invalid('catalog_unavailable');
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 262144) return invalid('catalog_too_large');
      chunks.push(Buffer.from(value));
    }
    return summarizeCityCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { return invalid('invalid_catalog'); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
