import { defineConfig } from "vitest/config";

export default defineConfig({ test: {
  include: ["tests/system/*-browser.test.ts"],
  fileParallelism: false, maxWorkers: 1, maxConcurrency: 1,
  env: { HTMLNEXT_BROWSER_TEST: "1" },
  hookTimeout: 60_000, testTimeout: 60_000,
} });
