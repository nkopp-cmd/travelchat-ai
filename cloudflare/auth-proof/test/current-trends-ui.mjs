import assert from 'node:assert/strict';

export async function currentTrendsUi({ page, capture }) {
  const observedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 86400000).toISOString();
  const week = new Date(observedAt); week.setUTCHours(0, 0, 0, 0); week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7);
  const payload = { status: 'ready', serverNow: observedAt, version: 'localley-visible-trends-v1', reviewId: 'SYNTHETIC-browser-review',
    citySlug: 'tokyo', weekStart: week.toISOString().slice(0, 10), observedAt, expiresAt, sourceEntries: 2, excludedEntries: 1, unreviewedEntries: 0,
    coverage: 'SYNTHETIC browser fixture. Not a real published trend.', rankings: [{ rank: 1,
      spotId: '00000000-0000-4000-8000-000000000001', name: 'SYNTHETIC Tokyo market', address: '1-1 Synthetic Street, Tokyo', lat: 35.66, lng: 139.77,
      venueUrl: 'https://localley.io/spots/00000000-0000-4000-8000-000000000001', postCount: 1, summary: 'Synthetic test update',
      source: { platform: 'youtube', kind: 'venue_owned_channel', label: 'Synthetic official channel', channelId: `UC${'a'.repeat(22)}`,
        ownerUrl: 'https://example.test/source', feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=UC${'a'.repeat(22)}`,
        videoId: 'SYNTHETIC01', url: 'https://www.youtube.com/watch?v=SYNTHETIC01', title: 'Synthetic title', publishedAt: observedAt,
        metrics: { views: 100, likes: null, comments: null, shares: null, saves: null }, bodySha256: 'a'.repeat(64) } }] };
  let mode = 'ready';
  await page.route('**/api/trends/current?city=tokyo', route => {
    if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Synthetic source failure' } });
    if (mode === 'empty') return route.fulfill({ json: { status: 'unready', serverNow: observedAt, rankings: [] } });
    if (mode === 'malformed') return route.fulfill({ json: { ...payload, rankings: [{ ...payload.rankings[0], source: { ...payload.rankings[0].source, url: 'javascript:alert(1)' } }] } });
    return route.fulfill({ json: mode === 'expires' ? { ...payload, expiresAt: new Date(Date.parse(observedAt) + 500).toISOString() } : payload });
  });
  await page.getByRole('button', { name: 'Current-week trends', exact: true }).click();
  await page.getByRole('heading', { name: 'SYNTHETIC Tokyo market' }).waitFor();
  const section = page.getByRole('region', { name: 'Current-week trends', exact: true });
  assert.equal(await section.getByText('Not reported', { exact: true }).count(), 4);
  assert.equal(await section.locator('img').count(), 0);
  await capture('trends-ready');
  mode = 'error'; await section.getByRole('button', { name: 'Refresh signals' }).click();
  await section.getByRole('alert').waitFor(); assert.equal(await section.locator('.trend-entry').count(), 0);
  await capture('trends-error');
  mode = 'malformed'; await section.getByRole('button', { name: 'Refresh signals' }).click();
  await section.getByRole('alert').waitFor(); assert.equal(await section.locator('.trend-entry').count(), 0);
  mode = 'empty'; await section.getByRole('button', { name: 'Refresh signals' }).click();
  await section.getByText('No fresh reviewed signals are available.', { exact: false }).waitFor();
  await capture('trends-empty');
  mode = 'expires'; await section.getByRole('button', { name: 'Refresh signals' }).click();
  await section.getByRole('heading', { name: 'SYNTHETIC Tokyo market' }).waitFor();
  await section.getByText('No fresh reviewed signals are available.', { exact: false }).waitFor({ timeout: 5000 });
  assert.equal(await section.locator('.trend-entry').count(), 0);
  await page.unroute('**/api/trends/current?city=tokyo');
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
}
