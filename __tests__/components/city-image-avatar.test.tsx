import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CityImageAvatar } from "@/components/ui/city-image";

// vitest.setup.ts stubs next/image; this file checks the real srcset next/image writes.
vi.unmock("next/image");

const srcsetEntries = (html: string) => (/srcSet="([^"]*)"/i.exec(html)?.[1] ?? "").split(", ").filter(Boolean);

describe("CityImageAvatar srcset size (Push CB1)", () => {
  it("a fixed px size writes a 1x/2x srcset, not the 16-entry fill srcset", () => {
    const html = renderToStaticMarkup(<CityImageAvatar city="Seoul" className="h-6 w-6 rounded-full" sizes="24px" />);
    const entries = srcsetEntries(html);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatch(/ 1x$/);
    expect(entries[1]).toMatch(/ 2x$/);
    expect(html).not.toContain('data-nimg="fill"');
    expect(html).toContain('width="24"');
    expect(html).toContain("absolute inset-0 h-full w-full object-cover");
  });

  it("the default 40px size is fixed too", () => {
    const html = renderToStaticMarkup(<CityImageAvatar city="Tokyo" />);
    expect(srcsetEntries(html)).toHaveLength(2);
    expect(html).toContain('width="40"');
  });

  it("a responsive sizes value keeps fill with its sizes attribute", () => {
    const html = renderToStaticMarkup(<CityImageAvatar city="Bangkok" sizes="(max-width: 768px) 100vw, 33vw" />);
    expect(html).toContain('data-nimg="fill"');
    expect(html).toContain('sizes="(max-width: 768px) 100vw, 33vw"');
  });

  it("one 24px chip avatar stays at 900 bytes or less (fill srcset made it ~3.1 KB) of HTML", () => {
    const html = renderToStaticMarkup(<CityImageAvatar city="Seoul" className="h-6 w-6 rounded-full" sizes="24px" />);
    expect(html.length).toBeLessThanOrEqual(900);
  });
});
