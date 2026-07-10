import { afterEach, describe, expect, it } from "vitest";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

function createRequest(authorization?: string): Request {
  const headers = new Headers();

  if (authorization !== undefined) {
    headers.set("authorization", authorization);
  }

  return new Request("https://www.localley.io/api/cron/cleanup-stories", {
    headers,
  });
}

describe("isCronRequestAuthorized", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("rejects requests when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;

    expect(
      isCronRequestAuthorized(createRequest("Bearer provided-secret")),
    ).toBe(false);
  });

  it("rejects requests with the wrong bearer secret", () => {
    process.env.CRON_SECRET = "expected-secret";

    expect(
      isCronRequestAuthorized(createRequest("Bearer wrong-secret")),
    ).toBe(false);
  });

  it("accepts requests with the correct bearer secret", () => {
    process.env.CRON_SECRET = "expected-secret";

    expect(
      isCronRequestAuthorized(createRequest("Bearer expected-secret")),
    ).toBe(true);
  });
});
