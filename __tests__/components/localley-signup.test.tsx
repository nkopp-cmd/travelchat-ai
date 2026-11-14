// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalleySignup, NEWSLETTER_SUBSCRIBE_ACTION } from "@/components/newsletter/localley-signup";

describe("LocalleySignup", () => {
  it("is a plain no-JS form posting to the double opt-in API with a hidden honeypot", () => {
    const html = renderToStaticMarkup(<LocalleySignup source="city-hub" city="seoul" />);
    expect(html).toContain(`action="${NEWSLETTER_SUBSCRIBE_ACTION}"`);
    expect(html).toContain('method="post"');
    expect(html).toMatch(/<input type="email"[^>]*required=""[^>]*name="email"/);
    expect(html).toContain('name="source" value="city-hub"');
    expect(html).toContain('name="city" value="seoul"');
    expect(html).toMatch(/<div aria-hidden="true"[^>]*><label[^>]*>Website<\/label><input[^>]*tabindex="-1"[^>]*name="website"/);
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(/<script|seoul-living|nilsgroove/i);
  });

  it("omits the city field when no city is given", () => {
    expect(renderToStaticMarkup(<LocalleySignup source="trending" />)).not.toContain('name="city"');
  });
});
