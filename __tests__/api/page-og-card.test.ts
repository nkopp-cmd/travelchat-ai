// @vitest-environment node
import { describe, expect, it } from "vitest";

const { GET } = await import("@/app/og/pages/[key]/route");
const call = (key: string) => GET(new Request(`https://www.localley.io/og/pages/${key}`), { params: Promise.resolve({ key }) });

describe("GET /og/pages/[key]", () => {
  it("renders a cacheable 1200x630 PNG for a registered page", async () => {
    const response = await call("help-korea-pay");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("s-maxage=604800");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
    if (process.env.PAGE_OG_OUT) (await import("node:fs")).writeFileSync(process.env.PAGE_OG_OUT, bytes);
  });

  it("returns 404 for a key outside the registry", async () => {
    expect((await call("anything-else")).status).toBe(404);
    expect((await call("__proto__")).status).toBe(404);
    expect((await call("toString")).status).toBe(404);
  });
});
