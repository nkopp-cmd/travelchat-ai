import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageRoutes, reviewErrors } from './check-route-review.mjs';

const source = 'a'.repeat(40);
const receipt = () => ({ source, previewUrl: 'https://localley-next-preview.nkopp.workers.dev',
  reviews: [390, 1440].map(width => ({ route: '/', width, reviewed: true, screenshot: `home-${width}.png` })) });

test('inventory includes root, dynamic pages and optional auth entry pages', () => {
  assert.deepEqual(pageRoutes(['app/page.tsx', 'app/(public)/spots/[id]/page.tsx',
    'app/sign-in/[[...sign-in]]/page.tsx', 'app/api/x/route.ts']), ['/', '/sign-in', '/spots/[id]']);
});
test('complete structural receipt is not rejected', () => {
  assert.deepEqual(reviewErrors(receipt(), ['/'], source), []);
});
test('missing or uninspected widths cannot pass', () => {
  const r = receipt(); r.reviews.pop();
  assert.ok(reviewErrors(r, ['/'], source).length);
  r.reviews[0].reviewed = false;
  assert.equal(reviewErrors(r, ['/'], source).length, 2);
});
test('old source and production URL cannot pass', () => {
  const r = receipt(); r.source = 'b'.repeat(40); r.previewUrl = 'https://www.localley.io';
  assert.equal(reviewErrors(r, ['/'], source).length, 2);
});
test('duplicate images, cases and unknown routes cannot hide missing coverage', () => {
  const r = receipt(); r.reviews[1].screenshot = r.reviews[0].screenshot;
  r.reviews.push({ ...r.reviews[0], route: '/unknown' });
  assert.ok(reviewErrors(r, ['/'], source).includes('screenshots must be distinct'));
  assert.ok(reviewErrors(r, ['/'], source).includes('unknown route or width'));
  r.reviews.push(r.reviews[0]);
  assert.ok(reviewErrors(r, ['/'], source).some(error => error.includes('/ 390:')));
});
test('credential or query-bearing preview URLs cannot pass', () => {
  for (const previewUrl of ['https://u:p@localley-next-preview.nkopp.workers.dev',
    'https://localley-next-preview.nkopp.workers.dev?token=secret']) {
    assert.ok(reviewErrors({ ...receipt(), previewUrl }, ['/'], source).includes('invalid preview URL'));
  }
});
