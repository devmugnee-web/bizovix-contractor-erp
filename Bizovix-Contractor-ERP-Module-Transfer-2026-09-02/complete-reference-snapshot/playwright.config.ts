import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      // Reuse the installed stable Chrome by default. This keeps local E2E
      // runs offline-friendly; CI can override the channel when it provisions
      // Playwright's bundled Chromium instead.
      use: {
        ...devices["Desktop Chrome"],
        channel:
          process.env.PLAYWRIGHT_BROWSER_CHANNEL ??
          (process.env.CI ? undefined : "chrome"),
      },
    },
  ],
});
