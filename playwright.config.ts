import { defineConfig } from "@playwright/test"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: resolve(tmpdir(), "opencode/yt-ledger-playwright-results"),
  projects: [
    {
      name: "dashboard",
      testMatch: /^(?!.*(overlays|hidden-tab-sync)\.spec\.ts$).*\.spec\.ts$/,
      use: { colorScheme: "light" }
    },
    {
      name: "overlays-light",
      testMatch: "**/overlays.spec.ts",
      use: { colorScheme: "light" }
    },
    {
      name: "overlays-dark",
      testMatch: "**/overlays.spec.ts",
      use: { colorScheme: "dark" }
    },
    // Firefox runs the stock install (WebDriver BiDi) with the extension
    // loaded as a temporary add-on; see e2e/fixtures.ts. BiDi can't drive
    // extension pages, so the UI-heavy dashboard specs stay Chromium-only and
    // extension.spec.ts covers the extension itself in both browsers.
    // hidden-tab-sync.spec.ts needs live youtube.com, like the overlays.
    {
      name: "firefox",
      testMatch: /(extension|hidden-tab-sync)\.spec\.ts$/,
      use: { browserName: "firefox", channel: "moz-firefox", colorScheme: "light" }
    },
    {
      name: "firefox-overlays-light",
      testMatch: "**/overlays.spec.ts",
      use: { browserName: "firefox", channel: "moz-firefox", colorScheme: "light" }
    },
    {
      name: "firefox-overlays-dark",
      testMatch: "**/overlays.spec.ts",
      use: { browserName: "firefox", channel: "moz-firefox", colorScheme: "dark" }
    }
  ]
})
