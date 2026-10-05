import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hasPreviewGuideIntent } from "@/lib/app-data/preview-guide-intent";

describe("guide candidate intent", () => {
  it.each([
    ["https://localley-next-preview.nkopp.workers.dev/api/connect/status?data_candidate=d1", true],
    ["https://localley-next-preview.nkopp.workers.dev/api/connect/status", false],
    ["https://localley-next-preview.nkopp.workers.dev/api/connect/status?data_candidate=source", false],
    ["https://localley-next-preview.nkopp.workers.dev/api/connect/status?data_candidate=source&data_candidate=d1", false],
    ["https://www.localley.io/api/connect/status?data_candidate=d1", false],
    ["https://localley-next-preview.nkopp.workers.dev.example.test/api/connect/status?data_candidate=d1", false],
  ])("selects only exact host and explicit first D1 flag: %s", (url, expected) => {
    expect(hasPreviewGuideIntent(new NextRequest(url))).toBe(expected);
  });
});
