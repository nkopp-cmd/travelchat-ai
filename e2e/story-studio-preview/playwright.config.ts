import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "..", testMatch: "story-studio*.spec.ts", workers: 1,
  timeout: 60_000, expect: { timeout: 10_000 },
  outputDir: "../../test-results/story-studio-browser",
  use: { baseURL: "http://127.0.0.1:4174", browserName: "chromium", serviceWorkers: "block", trace: "retain-on-failure" },
});
