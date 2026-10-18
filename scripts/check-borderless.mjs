import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

/** Ignore separators inside arbitrary Tailwind values and selectors. */
export function classParts(token) {
  const parts = []; let start = 0, depth = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '[') depth++;
    if (token[i] === ']') depth--;
    if (token[i] === ':' && depth === 0) { parts.push(token.slice(start, i)); start = i + 1; }
  }
  parts.push(token.slice(start));
  return parts;
}

export function isDecorativeClass(token) {
  const parts = classParts(token), utility = parts.pop().replace(/^!/, '');
  if (parts.some(part => /^(focus|focus-visible|focus-within|aria-invalid)$/.test(part) || part === "[&:focus-visible]")) return false;
  if (/^(border(?:-[xytrblse])?-0|border-(collapse|separate|spacing-.+)|ring-0|ring-offset-.+|outline-(none|hidden|0))$/.test(utility)) return false;
  return /^(border|ring|outline|divide)(?:$|-)/.test(utility);
}

export function sourceViolations(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), rows = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // The public variant name "outline" remains compatible; it now renders a filled surface.
      const parent = node.parent;
      const variant = ts.isLiteralTypeNode(parent) || (ts.isJsxAttribute(parent) && parent.name.text === 'variant') ||
        (ts.isPropertyAssignment(parent) && parent.name.getText(tree) === 'variant');
      if (!variant) for (const token of node.text.split(/\s+/)) {
        if (isDecorativeClass(token)) rows.push({ file: filename, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, token });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); return rows;
}

async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));
  return groups.flat();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const targets = process.argv.slice(2), files = targets.length ? targets : (await Promise.all(['app', 'components'].map(filesIn))).flat();
  const violations = (await Promise.all(files.map(async file => sourceViolations(await readFile(file, 'utf8'), file)))).flat();
  for (const row of violations) console.error(`${row.file}:${row.line}: decorative class ${row.token}`);
  console.log(`Borderless class guard: ${files.length} files, ${violations.length} violations.`);
  process.exitCode = violations.length ? 1 : 0;
}
