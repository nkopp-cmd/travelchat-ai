import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Push AC2: a sign-up link without redirect_url lands on /dashboard ("Pro needed") and loses the
// trip or checkout the visitor started. Every page/component sign-up link must carry redirect_url.
const ROOTS = ["app", "components"];
const SKIP = [join("app", "api")]; // API JSON `signupUrl` is mapped to a redirect_url link by the wizard (P4 test)

const BARE = /(?:href=\{?|push\(|replace\(|redirect\()\s*["'`]\/sign-up(?!\?redirect_url=|\$\{)/;
const WRONG_PARAM = /\/sign-up\?redirect=/;

function sourceFiles(dir: string): string[] {
  if (SKIP.includes(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

export function signUpLinkFaults(source: string): string[] {
  return source.split("\n").filter((line) => BARE.test(line) || WRONG_PARAM.test(line)).map((line) => line.trim());
}

describe("sign-up links keep the visitor's place (Push AC2)", () => {
  it("detects bare and wrong-parameter sign-up links", () => {
    expect(signUpLinkFaults('<Link href="/sign-up">')).toHaveLength(1);
    expect(signUpLinkFaults("<Link href={'/sign-up'}>")).toHaveLength(1);
    expect(signUpLinkFaults('router.push("/sign-up")')).toHaveLength(1);
    expect(signUpLinkFaults('router.push("/sign-up?redirect=/x")')).toHaveLength(1);
    expect(signUpLinkFaults("router.push(`/sign-up?redirect_url=${encodeURIComponent(path)}`)")).toHaveLength(0);
    expect(signUpLinkFaults("href={`/sign-up${suffix}`}")).toHaveLength(0);
  });

  const files = ROOTS.flatMap(sourceFiles);

  it("scans the page and component sources", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds no bare /sign-up link in app/ or components/", () => {
    const faults = files.flatMap((file) => signUpLinkFaults(readFileSync(file, "utf8")).map((line) => `${file}: ${line}`));
    expect(faults).toEqual([]);
  });
});
