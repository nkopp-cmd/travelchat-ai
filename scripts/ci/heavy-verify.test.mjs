// Guards the parallel heavy CI step: every file it tests or lints must trigger the workflow,
// and a docs-only change must not. A listed code file outside the paths filter could merge untested.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const workflowPath = '.github/workflows/d1-preview-verification.yml';
const workflow = readFileSync(workflowPath, 'utf8');

function pullRequestPaths() {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'paths:');
  const paths = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*$/.test(line)) continue;
    const match = line.match(/^\s+- '([^']+)'$/);
    if (!match) break;
    paths.push(match[1]);
  }
  return paths;
}

// GitHub filter globs: ** crosses directories, * and ? stay inside one segment.
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') { out += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
    else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

const filters = pullRequestPaths().map(globToRegExp);
const triggers = (file) => filters.some((re) => re.test(file));
const listed = execFileSync('bash', ['scripts/ci/heavy-verify.sh', '--list'], { encoding: 'utf8' })
  .trim().split('\n').map((line) => line.split(' ').slice(1).join(' '));

test('the workflow runs the parallel heavy script', () => {
  assert.match(workflow, /run-heavy\.sh scripts\/ci\/heavy-verify\.sh/);
  assert.ok(filters.length > 100, 'paths filter parsed');
});

test('every tested or linted file exists and triggers the workflow', () => {
  assert.ok(listed.length > 600, `listed ${listed.length}`);
  const missing = listed.filter((file) => !existsSync(file));
  assert.deepEqual(missing, []);
  const untriggered = listed.filter((file) => {
    const probe = statSync(file).isDirectory() ? `${file.replace(/\/$/, '')}/index.tsx` : file;
    return !triggers(probe);
  });
  assert.deepEqual(untriggered, []);
});

test('changes to the CI machinery trigger the workflow', () => {
  for (const file of [workflowPath, 'scripts/ci/heavy-verify.sh', 'scripts/ci/heavy-verify.test.mjs',
    'package.json', 'package-lock.json', 'vitest.config.ts']) {
    assert.ok(triggers(file), file);
  }
});

test('docs-only changes skip the workflow', () => {
  for (const file of ['README.md', 'CLAUDE.md', 'docs/releases/seoul-discovery.md', 'docs/AUTH_BETTER_AUTH.md']) {
    assert.equal(triggers(file), false, file);
  }
  assert.deepEqual(pullRequestPaths().filter((glob) => glob.endsWith('.md')), []);
});
