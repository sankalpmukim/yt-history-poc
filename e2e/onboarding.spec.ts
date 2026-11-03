import { test, expect } from "./fixtures"
import { mkdirSync } from "node:fs"

test("Onboarding can be rerun and completed through every step", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Settings/ }).click()
  await page.getByRole("button", { name: /Rerun onboarding/ }).click()
  await expect(page.getByRole("heading", { name: /Welcome — an expense manager/ })).toBeVisible()
  mkdirSync("qa/e2e/onboarding", { recursive: true })
  await page.screenshot({ path: "qa/e2e/onboarding/01-welcome.png", fullPage: true })

  await page.getByRole("button", { name: "Start setup" }).click()
  await expect(page.getByRole("heading", { name: "Set up your category ladder" })).toBeVisible()
  await expect(page.locator("body")).not.toContainText(/0–5|0-5|\b[0-5]\s*\/\s*5\b/)
  await page.screenshot({ path: "qa/e2e/onboarding/02-categories.png", fullPage: true })
  await page.getByRole("button", { name: "Skip (keep defaults)" }).click()

  await expect(page.getByRole("heading", { name: "Starter rules" })).toBeVisible()
  await page.getByRole("button", { name: "Start clean (no starter rules)" }).click()
  await expect(page.getByRole("heading", { name: "Budget enforcement on YouTube (optional)" })).toBeVisible()
  await page.getByRole("button", { name: "Continue with off" }).click()
  await expect(page.getByRole("heading", { name: "You're set 🎉" })).toBeVisible()
  await page.getByRole("button", { name: "Open dashboard" }).click()
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible()
  await expect.poll(async () => page.evaluate(async () => {
    const meta = (await chrome.storage.local.get("yl.v2.meta"))["yl.v2.meta"]
    return (meta as { settings: { onboardedAt: string | null } }).settings.onboardedAt
  })).toBeTruthy()
  await page.screenshot({ path: "qa/e2e/onboarding/dashboard.png", fullPage: true })
})
