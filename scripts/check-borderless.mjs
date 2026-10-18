import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';

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
  if (/^(border(?:-[xytrblse])?-0|border-(box;?|collapse|separate|spacing-.+)|ring-0|ring-offset-.+|outline-(none|hidden|0))$/.test(utility)) return false;
  return /^(border|ring|outline|divide)(?:$|-)/.test(utility) || /^(h|w)-(px|\[1px\])$/.test(utility) || /^shadow-\[(?:inset_)?0(?:px)?_0(?:px)?_0(?:px)?_[1-9]/.test(utility);
}

function hasClassContext(node, styleInitializers = new Set()) {
  if (styleInitializers.has(node)) return true;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (styleInitializers.has(parent)) return true;
    if (ts.isJsxAttribute(parent) && /^(?:class|className|[a-zA-Z]+ClassName)$/.test(parent.name.text)) return true;
    if (ts.isPropertyAssignment(parent) && /^(?:class|className|[a-zA-Z]+ClassName)$/.test(parent.name.getText())) return true;
    if (ts.isCallExpression(parent) && /^(cn|cva|clsx|twMerge|classNames)$/.test(parent.expression.getText())) return true;
    if ((ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)) && parent.name && /(?:class(?:name|es)?|variants?|styles?|tone)$/i.test(parent.name.getText())) return true;
  }
  return false;
}

export function literalDecorations(node, styleInitializers) {
  if (!(ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) return [];
  const parent = node.parent;
  const variant = ts.isLiteralTypeNode(parent) || (ts.isJsxAttribute(parent) && parent.name.text === 'variant') ||
    (ts.isPropertyAssignment(parent) && parent.name.getText() === 'variant');
  if (variant) return [];
  return node.text.split(/\s+/).filter(token => isDecorativeClass(token) &&
    // Bare words also occur in product copy and prompts. Inspect them only in styling contexts.
    (!/^(border|ring|outline|divide)$/.test(token) || hasClassContext(node, styleInitializers)));
}

export function sourceViolations(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), rows = [];
  // Resolve same-file constants by symbol, not spelling. A local shadow must not
  // classify an unrelated module-level prompt as CSS. No imports are loaded.
  const options = { noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = file => file === filename ? tree : undefined;
  const checker = ts.createProgram([filename], options, host).getTypeChecker();
  const styleInitializers = new Set(), symbols = new Set();
  function follow(node) {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol && !symbols.has(symbol)) {
        symbols.add(symbol);
        for (const declaration of symbol.declarations || []) {
          if (ts.isVariableDeclaration(declaration) && declaration.initializer && declaration.getSourceFile() === tree) {
            styleInitializers.add(declaration.initializer);
            follow(declaration.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, follow);
  }
  function findReferences(node) {
    if (ts.isIdentifier(node) && hasClassContext(node)) follow(node);
    ts.forEachChild(node, findReferences);
  }
  findReferences(tree);
  function visit(node) {
    for (const token of literalDecorations(node, styleInitializers)) rows.push({ file: filename, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, token });
    ts.forEachChild(node, visit);
  }
  visit(tree); return rows;
}

export function cssViolations(source, filename) {
  const tree = postcss.parse(source, {from:filename}), rows = [];
  function functional(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.selector && /:focus|\[aria-invalid/.test(parent.selector)) return true;
      if (parent.type === 'atrule' && parent.name === 'media' && /forced-colors\s*:\s*active/.test(parent.params)) return true;
    }
    return false;
  }
  function report(node, token) { rows.push({file:filename,line:node.source.start.line,token}); }
  tree.walkDecls(node => {
    if (functional(node)) return;
    const sizing = /^(border-radius|border-collapse|border-spacing|outline-offset)$/.test(node.prop);
    if (!sizing && /^(border|outline)(?:$|-)/.test(node.prop) && !/^(0(?:px|rem|em)?|none)(?:\s|$)/.test(node.value)) report(node,node.prop+': '+node.value);
    if (node.prop === 'box-shadow' && /0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+[1-9][0-9]*(?:\.\d+)?px/.test(node.value)) report(node,node.prop+': '+node.value);
  });
  tree.walkAtRules('apply',node => {if(!functional(node)) for(const token of node.params.split(/\s+/)) if(isDecorativeClass(token)) report(node,token);});
  return rows;
}

async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));
  return groups.flat();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const targets = process.argv.slice(2), files = targets.length ? targets : [...(await Promise.all(['app', 'components', 'hooks', 'providers', 'lib'].map(filesIn))).flat(), 'app/globals.css', ...(await readdir('styles')).filter(x=>x.endsWith('.css')).map(x=>'styles/'+x)];
  const violations = (await Promise.all(files.map(async file => (file.endsWith('.css') ? cssViolations : sourceViolations)(await readFile(file, 'utf8'), file)))).flat();
  for (const row of violations) console.error(`${row.file}:${row.line}: decorative class ${row.token}`);
  console.log(`Borderless class guard: ${files.length} files, ${violations.length} violations.`);
  process.exitCode = violations.length ? 1 : 0;
}
