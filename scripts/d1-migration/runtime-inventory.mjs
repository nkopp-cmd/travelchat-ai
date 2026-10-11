/** Offline migration inventory. Static reachability never certifies a live cutover. */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';

const ROOTS = ['src', 'app', 'lib', 'hooks', 'providers', 'components', 'cloudflare', 'emails', 'types', 'scripts', 'ops', 'supabase/functions'];
const BUILTINS = new Set(['Array', 'Buffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']);
const METHODS = new Set(['select', 'insert', 'upsert', 'update', 'delete', 'upload', 'download', 'remove', 'list', 'getPublicUrl', 'createSignedUrl', 'createSignedUrls']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const unwrap = n => ts.isAwaitExpression(n) || ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) ? unwrap(n.expression) : n;
function rootName(node) {
  const n = unwrap(node);
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) return rootName(n.expression);
  if (ts.isCallExpression(n)) return rootName(n.expression);
  return null;
}
function memberNames(node) {
  const n = unwrap(node);
  if (ts.isPropertyAccessExpression(n)) return [...memberNames(n.expression), n.name.text];
  if (ts.isElementAccessExpression(n)) return [...memberNames(n.expression), ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : '<computed>'];
  if (ts.isCallExpression(n)) return memberNames(n.expression);
  return [];
}
function methods(node) {
  const found = [];
  let current = node;
  while (current.parent && ((ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current)
    || (ts.isCallExpression(current.parent) && current.parent.expression === current))) {
    current = current.parent;
    if (ts.isPropertyAccessExpression(current) && METHODS.has(current.name.text)) found.push(current.name.text);
  }
  return [...new Set(found)].sort();
}
function moduleAnalysis(path, text) {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, /\.(tsx|jsx)$/.test(path) ? ts.ScriptKind.TSX : /\.(mjs|cjs|js)$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const imports = []; const clients = new Set(); const storageClients = new Set(); const subsystemAliases = new Map(); const accesses = []; const dynamicImports = [];
  const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
  walk(file, n => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      const spec = literal(n.moduleSpecifier); if (spec) imports.push(spec);
      if (ts.isImportDeclaration(n) && /supabase/i.test(spec ?? '')) {
        const clause = n.importClause;
        if (clause?.name) clients.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) clients.add(element.name.text);
        }
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) clients.add(clause.namedBindings.name.text);
      }
    }
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(n.expression) && n.expression.text === 'require')) {
      const spec = literal(n.arguments[0]);
      if (spec) imports.push(spec); else dynamicImports.push(file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1);
    }
  });
  // Follow local aliases of a source client/factory; unresolved receivers remain explicit.
  let changed = true;
  while (changed) {
    changed = false;
    walk(file, n => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const root = rootName(n.initializer);
        if (clients.has(root) && !clients.has(n.name.text)) { clients.add(n.name.text); changed = true; }
        for (const kind of ['auth', 'functions', 'storage']) {
          if (memberNames(n.initializer).includes(kind) || subsystemAliases.get(root) === kind) {
            if (!subsystemAliases.has(n.name.text)) { subsystemAliases.set(n.name.text, kind); changed = true; }
          }
        }
        if ((storageClients.has(root) || memberNames(n.initializer).includes('storage'))
          && !storageClients.has(n.name.text)) { storageClients.add(n.name.text); changed = true; }
      }
      if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer) {
        for (const element of n.name.elements) {
          const property = element.propertyName?.getText(file) ?? element.name.getText(file);
          if (['auth','functions','storage'].includes(property) && ts.isIdentifier(element.name)
            && subsystemAliases.get(element.name.text) !== property) {
            subsystemAliases.set(element.name.text, property); changed = true;
          }
        }
      }
    });
  }
  walk(file, n => {
    if (!ts.isCallExpression(n) || !(ts.isPropertyAccessExpression(n.expression) || ts.isElementAccessExpression(n.expression))) return;
    const method = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : literal(n.expression.argumentExpression);
    const root = rootName(n.expression.expression);
    const aliasKind = subsystemAliases.get(root);
    const receiverMembers = memberNames(n.expression.expression);
    const subsystem = receiverMembers.includes('auth') || aliasKind === 'auth' ? 'auth'
      : receiverMembers.includes('functions') || aliasKind === 'functions' ? 'function'
        : (receiverMembers.includes('storage') || aliasKind === 'storage') && ['getBucket','listBuckets','createBucket','updateBucket','emptyBucket','deleteBucket'].includes(method) ? 'storage-api' : null;
    if (!['from', 'rpc', 'channel', 'removeChannel', 'removeAllChannels', 'getChannels'].includes(method)
      && !subsystem) return;
    if (BUILTINS.has(root)) return;
    const kind = subsystem ?? (method === 'rpc' ? 'rpc' : ['channel','removeChannel','removeAllChannels','getChannels'].includes(method)
      ? 'realtime' : aliasKind === 'storage' || storageClients.has(root) || memberNames(n.expression.expression).includes('storage') ? 'storage' : 'table');
    const resource = subsystem === 'auth' || subsystem === 'storage-api' ? method : literal(n.arguments[0]);
    accesses.push({ line: file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1,
      kind, resource, operations: subsystem === 'storage-api' ? [method] : methods(n), evidence: clients.has(root) ? 'source_client' : 'unresolved_receiver',
      dynamicResource: resource === null });
  });
  walk(file, n => {
    if (ts.isCallExpression(n) && rootName(n.expression) === 'fetch' && n.arguments[0]
      && /supabase|\/rest\/v1|\/storage\/v1|\/auth\/v1|\/functions\/v1/i.test(n.arguments[0].getText(file))) {
      accesses.push({ line: file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1,
        kind: 'raw-http', resource: 'source-http', operations: [], evidence: 'unresolved_receiver', dynamicResource: true });
    }
  });
  return { path, sha256: sha(text), imports: [...new Set(imports)].sort(), accesses, dynamicImports };
}

export function runtimeInventory(sources) {
  const modules = Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)).map(([path, text]) => moduleAnalysis(path, text));
  const byPath = new Map(modules.map(m => [m.path, m]));
  const unresolvedImports = [];
  for (const m of modules) {
    m.dependencies = [];
    for (const spec of m.imports) {
      if (!spec.startsWith('@/') && !spec.startsWith('.')) continue;
      const base = spec.startsWith('@/') ? spec.slice(2) : posix.normalize(posix.join(posix.dirname(m.path), spec));
      const targets = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), ...['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'].map(suffix => base + suffix)];
      const target = targets.find(p => byPath.has(p));
      if (target) m.dependencies.push(target);
      else if (!/\.(css|json|svg|png|jpe?g|webp|woff2?|ttf)$/.test(base)) unresolvedImports.push({ path: m.path, import: spec });
    }
    m.dependencies.sort();
  }
  function closure(start) {
    const seen = new Set(); const queue = [start];
    while (queue.length) {
      const path = queue.pop(); if (seen.has(path)) continue;
      seen.add(path); queue.push(...byPath.get(path).dependencies);
    }
    return [...seen].sort();
  }
  const entrypoints = modules.filter(m => /^(?:src\/)?app\/(?:.*\/)?(?:route|page|layout|sitemap|robots|opengraph-image|twitter-image|icon|apple-icon|error|global-error|not-found|loading|template|default)\.(?:ts|tsx|js|jsx)$/.test(m.path)
    || /^(cloudflare|scripts|ops)\/.*\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/.test(m.path) || /^(?:src\/)?(?:middleware|proxy|instrumentation|instrumentation-client)\.ts$/.test(m.path) || m.path.startsWith('supabase/functions/')).map(m => {
    const reachable = closure(m.path);
    const sourceModules = reachable.filter(p => byPath.get(p).accesses.length);
    return { path: m.path, role: m.path.startsWith('scripts/') || m.path.startsWith('ops/') ? 'operational_script' : 'application', sourceModules,
      sourceAccesses: sourceModules.reduce((n, p) => n + byPath.get(p).accesses.length, 0),
      candidateImports: reachable.filter(p => p.startsWith('lib/app-data/')),
      unresolvedImports: unresolvedImports.filter(row => reachable.includes(row.path)),
      dynamicImports: reachable.flatMap(p => byPath.get(p).dynamicImports.map(line => ({ path: p, line }))),
      parity: 'not_proven' };
  });
  const resources = {};
  for (const m of modules) for (const access of m.accesses) {
    const key = `${access.kind}:${access.resource ?? '<dynamic>'}`;
    (resources[key] ??= []).push({ path: m.path, ...access });
  }
  const sourceEntries = entrypoints.filter(e => e.sourceAccesses > 0);
  return { schemaVersion: 1, readOnly: true, cutoverReady: false,
    summary: { modules: modules.length, directAccessModules: modules.filter(m => m.accesses.length).length,
      accessSites: modules.reduce((n, m) => n + m.accesses.length, 0),
      tableNames: Object.keys(resources).filter(k => k.startsWith('table:') && !k.endsWith('<dynamic>')).length,
      rpcNames: Object.keys(resources).filter(k => k.startsWith('rpc:') && !k.endsWith('<dynamic>')).length,
      bucketNames: Object.keys(resources).filter(k => k.startsWith('storage:') && !k.endsWith('<dynamic>')).length,
      entrypoints: entrypoints.length, sourceReachableEntrypoints: sourceEntries.length,
      applicationSourceEntrypoints: sourceEntries.filter(e => e.role === 'application').length,
      operationalSourceEntrypoints: sourceEntries.filter(e => e.role === 'operational_script').length,
      withCandidateImports: sourceEntries.filter(e => e.candidateImports.length).length,
      withoutCandidateImports: sourceEntries.filter(e => !e.candidateImports.length).length,
      unresolvedReceivers: modules.flatMap(m => m.accesses).filter(a => a.evidence === 'unresolved_receiver').length,
      dynamicResources: modules.flatMap(m => m.accesses).filter(a => a.dynamicResource).length,
      unresolvedImports: unresolvedImports.length, dynamicImports: modules.reduce((n, m) => n + m.dynamicImports.length, 0) },
    sourceDigest: sha(modules.map(m => `${m.path}\0${m.sha256}`).join('\n')),
    modules, resources, entrypoints, unresolvedImports,
    limits: ['Static imports are possible reachability, not executed runtime paths.',
      'Candidate imports do not prove a route gate, data parity or production readiness.',
      'Unresolved receivers/resources/imports require manual review; they are never treated as migrated.',
      'Operational scripts are included without assuming they are scheduled or currently executed.',
      'This covers checked-in source only, not generated OpenNext code, installed SQL, external writers, physical tables or media parity.',
      'SDK auth/functions/realtime calls and explicit source HTTP fetches are included where recognized; dynamic client/member/URL indirection still needs manual review.'] };
}

export async function inventoryCheckout(root) {
  const sources = {};
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (!pkg.dependencies?.next || !(await readdir(root)).includes('app')) throw Error('invalid_localley_checkout');
  const { stdout } = await promisify(execFile)('git', ['-C', root, 'ls-files', '-z', '--',
    ...ROOTS, 'middleware.ts', 'proxy.ts', 'instrumentation.ts', 'instrumentation-client.ts'], { maxBuffer: 4 * 1024 * 1024 });
  for (const path of stdout.split('\0').filter(Boolean)) {
    if (!/\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/.test(path)
      || /\.(test|spec|d)\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/.test(path)
      || path.split('/').some(part => ['node_modules', '__tests__', '.next', '.open-next'].includes(part))) continue;
    if (posix.isAbsolute(path) || path.split('/').includes('..')) throw Error('invalid_tracked_path');
    sources[path] = await readFile(resolve(root, path), 'utf8');
  }
  return { ...runtimeInventory(sources), checkoutPolicy: "git_tracked_source" };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw Error('usage: runtime-inventory.mjs --out NEW_REPORT');
  const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
  const result = await inventoryCheckout(root);
  await writeFile(resolve(args[1]), JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ ...result.summary, sourceDigest: result.sourceDigest, readOnly: true, cutoverReady: false }));
}
