import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countLegacy, regressions } from './check-design-tokens.mjs';

test('counts each legacy styling category', () => {
  assert.deepEqual(countLegacy('className="bg-gradient-to-r from-violet-500 text-gray-400 bg-white/10 text-[10px] shadow-violet-500/20 bg-[#7c3aed] bg-clip-text"'),
    { gradient: 1, 'raw-hex': 1, 'white-alpha': 1, palette: 1, 'tiny-text': 1, 'colored-shadow': 1, 'gradient-text': 1 });
  // A dark scrim over a photo keeps text readable; it is not a decorative gradient.
  assert.deepEqual(countLegacy('className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5"'), {});
  assert.deepEqual(countLegacy('className="bg-surface text-muted-foreground bg-primary text-primary-foreground shadow-surface rounded-2xl"'), {});
});

test('fails above the baseline and for new files, passes at or below it', () => {
  const baseline = { 'app/a.tsx': { palette: 3 } };
  assert.deepEqual(regressions({ 'app/a.tsx': { palette: 3 } }, baseline, {}), []);
  assert.deepEqual(regressions({ 'app/a.tsx': { palette: 1 } }, baseline, {}), []);
  assert.deepEqual(regressions({ 'app/a.tsx': { palette: 4 } }, baseline, {}), [{ file: 'app/a.tsx', name: 'palette', count: 4, allowed: 3 }]);
  assert.deepEqual(regressions({ 'app/b.tsx': { gradient: 1 } }, baseline, {}), [{ file: 'app/b.tsx', name: 'gradient', count: 1, allowed: 0 }]);
  assert.deepEqual(regressions({ 'app/b.tsx': { gradient: 1 } }, baseline, { 'app/b.tsx': { gradient: 'reason' } }), []);
});

test('the pages already moved to tokens stay at zero', async () => {
  const baseline = JSON.parse(await readFile(new URL('./design-token-baseline.json', import.meta.url), 'utf8'));
  for (const file of ['components/layout/page-header.tsx', 'components/layout/page-shell.tsx', 'components/chat/source-chat-page.tsx',
    'components/spots/spots-map.tsx', 'components/dashboard/mobile-dashboard-content.tsx']) {
    assert.equal(baseline[file], undefined, `${file} must have no legacy allowance`);
  }
});
