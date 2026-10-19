import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceViolations, embeddedHtmlViolations, cssViolations } from './check-borderless.mjs';

test('rejects embedded map marker frames', () => {
  const rows = embeddedHtmlViolations('<div style="width:48px;height:48px;border:3px solid white;border-radius:8px"></div>', 'map.tsx');
  assert.deepEqual(rows.map(row => row.token), ['border: 3px solid white']);
});
test('detects HTML attributes spanning template interpolations without running them', () => {
  const source = 'const html = `<div style="background:${color};border:2px solid white">${title}</div>`;';
  assert.deepEqual(sourceViolations(source, 'map.tsx').map(row => row.token), ['border: 2px solid white']);
});
test('retains the zero-size triangular pointer but rejects a frame on a sized box', () => {
  const sides = 'border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid white';
  assert.deepEqual(embeddedHtmlViolations(`<div style="width:0;height:0;${sides}"></div>`, 'map.tsx'), []);
  assert.equal(embeddedHtmlViolations(`<div style="width:48px;height:48px;${sides}"></div>`, 'map.tsx').length, 3);
});
test('triangle exemption cannot hide outlines, shadows or a border shorthand', () => {
  const html = '<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid white;outline:1px solid red;border:1px solid red;box-shadow:0 0 0 1px red"></div>';
  assert.equal(embeddedHtmlViolations(html, 'map.tsx').length, 3);
});
test('retains non-painting declarations, rounded corners and wholly dynamic values', () => {
  assert.deepEqual(embeddedHtmlViolations('<div style="box-sizing:border-box;border:0;outline:none;border-radius:8px"></div>', 'map.tsx'), []);
  assert.deepEqual(sourceViolations('const html = `<div style="${styles}"></div>`;', 'map.tsx'), []);
});
test('preserves CSS focus, invalid-state and forced-color affordances', () => {
  const css = '.field:focus-visible {outline:3px solid blue} [aria-invalid=true] {border:1px solid red} @media (forced-colors: active) {.field {outline:1px solid CanvasText}}';
  assert.deepEqual(cssViolations(css, 'form.css'), []);
});
