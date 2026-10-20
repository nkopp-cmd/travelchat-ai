import { describe, expect, it } from 'vitest';
import { classParts, isDecorativeClass, sourceViolations, cssViolations } from '../../scripts/check-borderless.mjs';

describe('decorative border guard', () => {
  it.each(['border', 'border!', 'sm:hover:ring-2!', 'divide-y!', 'sm:hover:border-violet-200/20', 'ring-1', 'divide-y', 'outline-2', '[&>svg]:ring-1', 'h-px', 'w-[1px]', 'shadow-[0_0_0_1px_red]'])('rejects decoration: %s', token => {
    expect(isDecorativeClass(token)).toBe(true);
  });
  it.each(['focus-visible:ring-2', 'focus-visible:ring-2!', 'aria-invalid:border-destructive!', 'dark:focus:ring-ring', 'aria-invalid:border-destructive', 'file:border-0', 'outline-none', 'ring-offset-background', 'border-box', 'border-box;', 'border-collapse', 'border-spacing-2', 'rounded-xl', 'shadow-surface'])('keeps functional and non-border utilities: %s', token => {
    expect(isDecorativeClass(token)).toBe(false);
  });
  it('does not rewrite product copy or prompt language', () => {
    expect(sourceViolations('const prompt = \"Write an outline!\";', 'prompt.ts')).toEqual([]);
  });
  it('checks important JSX classes while retaining important focus exceptions', () => {
    expect(sourceViolations('<div className="border! sm:hover:ring-2! focus-visible:ring-2!" />', 'important.tsx').map(row => row.token)).toEqual(['border!', 'sm:hover:ring-2!']);
  });
  it('follows shared class constants and aliases without relying on their names', () => {
    const source = 'const BASE = "rounded-lg border"; const PANEL = `${BASE} bg-surface`; const view = <section className={`${PANEL} p-4`} />;';
    expect(sourceViolations(source, 'detail.tsx').map(row => row.token)).toEqual(['border']);
  });
  it('respects local shadowing and keeps unrelated copy', () => {
    const source = 'const BASE = "Write an outline"; function Card() { const BASE = "rounded-lg border"; return <div className={BASE} />; }';
    expect(sourceViolations(source, 'shadow.tsx').map(row => row.token)).toEqual(['border']);
  });
  it('retains focus affordances in reused constants and terminates cyclic aliases', () => {
    const source = 'const A = B; const B = `${A} focus-visible:ring-2`; const view = <div className={A} />;';
    expect(sourceViolations(source, 'focus.tsx')).toEqual([]);
  });
  it('checks forwarded frame and credit class props', () => {
    expect(sourceViolations('<Photo frameClassName="border" creditClassName="ring" />', 'photo.tsx').map(row => row.token)).toEqual(['border', 'ring']);
  });
  it('leaves generated CSS sizing intact', () => {
    expect(sourceViolations('const html = `body { box-sizing: border-box; }`;', 'export.ts')).toEqual([]);
  });
  it('does not split a colon inside an arbitrary selector', () => {
    expect(classParts('[&:focus-visible]:ring-2')).toEqual(['[&:focus-visible]', 'ring-2']);
    // Preserve keyboard focus even when its selector uses arbitrary Tailwind syntax.
    expect(isDecorativeClass('[&:focus-visible]:ring-2')).toBe(false);
  });
  it('reads JSX expressions and template branches while retaining compatible variant names', () => {
    const source = 'type Mode = "outline"; const view = <Button variant="outline" className={`bg-card ${active ? "border" : "focus-visible:ring-2"}`} />;';
    expect(sourceViolations(source, 'example.tsx')).toEqual([{file:'example.tsx',line:1,token:'border'}]);
  });
});

describe('borderless CSS rules', () => {
  it('rejects borders, decorative apply utilities and hard outline shadows', () => {
    expect(cssViolations('.panel { border: 1px solid red; box-shadow: 0 0 0 1px red; } .tabs { @apply divide-y; }', 'ui.css')).toHaveLength(3);
  });
  it('retains focus, forced-color affordances and non-painting sizing', () => {
    expect(cssViolations('.field:focus-visible { outline:3px solid; } @media (forced-colors: active) { input { outline:1px solid CanvasText; } } .native { box-sizing:border-box; border-radius:16px; outline:none; border:0; }', 'ui.css')).toEqual([]);
  });
});
