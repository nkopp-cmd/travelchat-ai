import { describe, expect, it } from 'vitest';
import { classParts, isDecorativeClass, sourceViolations } from '../../scripts/check-borderless.mjs';

describe('decorative border guard', () => {
  it.each(['border', 'sm:hover:border-violet-200/20', 'ring-1', 'divide-y', 'outline-2', '[&>svg]:ring-1'])('rejects decoration: %s', token => {
    expect(isDecorativeClass(token)).toBe(true);
  });
  it.each(['focus-visible:ring-2', 'dark:focus:ring-ring', 'aria-invalid:border-destructive', 'file:border-0', 'outline-none', 'ring-offset-background', 'border-collapse', 'border-spacing-2', 'rounded-xl', 'shadow-surface'])('keeps functional and non-border utilities: %s', token => {
    expect(isDecorativeClass(token)).toBe(false);
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
