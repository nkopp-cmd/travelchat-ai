/** Offline migration inventory. Static reachability never certifies a live cutover. */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOTS = ['app', 'lib', 'hooks', 'providers', 'components', 'cloudflare', 'emails', 'types', 'scripts', 'ops'];
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
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = []; const clients = new Set(); const accesses = []; const dynamicImports = [];
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
      }
    });
  }
  walk(file, n => {
    if (!ts.isCallExpression(n) || !(ts.isPropertyAccessExpression(n.expression) || ts.isElementAccessExpression(n.expression))) return;
    const method = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : literal(n.expression.argumentExpression);
    if (!['from', 'rpc'].includes(method)) return;
    const root = rootName(n.expression.expression);
    if (BUILTINS.has(root)) return;
    const receiver = n.expression.expression.getText(file);
    const kind = method === 'rpc' ? 'rpc' : /\.storage(?:\b|\[)/.test(receiver) ? 'storage' : 'table';
    const resource = literal(n.arguments[0]);
    accesses.push({ line: file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1,
      kind, resource, operations: methods(n), evidence: clients.has(root) ? 'source_client' : 'unresolved_receiver',
      dynamicResource: resource === null });
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
  const entrypoints = modules.filter(m => /^app\/.*\/(?:route|page|layout)\.tsx?$/.test(m.path)
    || /^(cloudflare|scripts|ops)\/.*\.(ts|mjs|js)$/.test(m.path) || m.path === 'middleware.ts').map(m => {
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
    modules, resources, entrypoints,
    limits: ['Static imports are possible reachability, not executed runtime paths.',
      'Candidate imports do not prove a route gate, data parity or production readiness.',
      'Unresolved receivers/resources/imports require manual review; they are never treated as migrated.',
      'Operational scripts are included without assuming they are scheduled or currently executed.',
      'This covers checked-in source only, not generated OpenNext code, installed SQL, external writers, physical tables or media parity.',
      'Computed member names, reflection and clients passed through untracked aliases can need further manual review.'] };
}

export async function inventoryCheckout(root) {
  const sources = {};
  async function visit(folder) {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', '__tests__', '.next', '.open-next'].includes(entry.name)) await visit(path); }
      else if (entry.isFile() && /\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.(test|spec|d)\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        sources[relative(root, path).split('\\').join('/')] = await readFile(path, 'utf8');
      }
    }
  }
  for (const folder of ROOTS) await visit(resolve(root, folder));
  try { sources['middleware.ts'] = await readFile(resolve(root, 'middleware.ts'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return runtimeInventory(sources);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw Error('usage: runtime-inventory.mjs --out NEW_REPORT');
  const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
  const result = await inventoryCheckout(root);
  await writeFile(resolve(args[1]), JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ ...result.summary, sourceDigest: result.sourceDigest, readOnly: true, cutoverReady: false }));
}
