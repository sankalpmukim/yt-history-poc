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
      testMatch: /^(?!.*overlays\.spec\.ts$).*\.spec\.ts$/,
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
    }
  ]
})
