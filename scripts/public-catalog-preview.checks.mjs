import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPublicCatalogPreview } from '../lib/trips/public-catalog-preview.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const spot = (n, extra = {}) => ({ id: id(n), name: `Place ${n}`, citySlug: 'seoul', category: 'Food', ...extra });

test('caps samples at three and emits only the public preview allowlist', () => {
  const rows = [1, 2, 3, 4].map(n => spot(n, { areaName: 'Sourced area', email: 'private@example.test',
    ownerId: 'private', location: { lat: 1, lng: 2 }, photos: ['https://example.test/private.jpg'], tips: ['private'] }));
  const result = projectPublicCatalogPreview(rows, 'seoul');
  assert.equal(result.spots.length, 3);
  assert.deepEqual(Object.keys(result.spots[0]), ['id', 'name', 'category', 'area', 'href']);
  assert.deepEqual(result.areas, ['Sourced area']);
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('deduplicates both public IDs and normalized names without changing display names', () => {
  const result = projectPublicCatalogPreview([spot(1, { name: 'Cafe Name' }), spot(1),
    spot(2, { name: '  CAFE   NAME ' }), spot(3, { name: '카페 이름' })], 'seoul');
  assert.deepEqual(result.spots.map(row => row.name), ['Cafe Name', '카페 이름']);
});
test('requires an exact source-backed city association', () => {
  const result = projectPublicCatalogPreview([spot(1, { citySlug: 'tokyo' }), spot(2, { citySlug: undefined }), spot(3)], 'seoul');
  assert.deepEqual(result.spots.map(row => row.id), [id(3)]);
});
test('does not invent areas, names, coordinates or fallback places', () => {
  const result = projectPublicCatalogPreview([spot(1), spot(2, { name: '' }), spot(3, { areaName: null })], 'seoul');
  assert.deepEqual(result.areas, []);
  assert.ok(result.spots.every(row => !('area' in row) && !('location' in row)));
  assert.deepEqual(projectPublicCatalogPreview([], 'seoul'), { spots: [], areas: [] });
});
test('refuses oversized input and unsafe city identifiers', () => {
  assert.throws(() => projectPublicCatalogPreview(Array.from({ length: 25 }, (_, n) => spot(n)), 'seoul'));
  for (const city of ['', 'Seoul', 'seoul?token=x', '../seoul', null])
    assert.throws(() => projectPublicCatalogPreview([], city));
});
test('drops malformed IDs and overlong fields without truncating real titles', () => {
  const result = projectPublicCatalogPreview([spot(1, { id: 'javascript:alert(1)' }),
    spot(2, { name: 'x'.repeat(201) }), spot(3, { category: null }), spot(4, { name: 'A complete long place name' })], 'seoul');
  assert.deepEqual(result.spots.map(row => row.name), ['A complete long place name']);
  assert.equal(result.spots[0].href, `/spots/${id(4)}`);
});
test('does not mutate the existing public catalog objects', () => {
  const row = Object.freeze(spot(1, { name: '  Source name  ' }));
  projectPublicCatalogPreview(Object.freeze([row]), 'seoul');
  assert.equal(row.name, '  Source name  ');
});
