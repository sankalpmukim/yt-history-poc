import { mkdirSync, readFileSync } from "node:fs"
import { test, expect } from "./fixtures"

test("Settings custom sync, retention, CSV/JSON export, JSON re-import, and pasted import", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Settings/ }).click()

  // Keep this integration test local and deterministic; verify the exact
  // extension message without opening a live /feed/history coordinator tab.
  await page.evaluate(() => {
    const runtime = chrome.runtime
    const original = runtime.sendMessage.bind(runtime)
    ;(runtime as any).sendMessage = async (message: { type?: string; daysBack?: number }) => {
      if (message?.type === "yl.manualSync") {
        ;(window as any).__manualSyncMessage = message
        return { status: `manual sync (${message.daysBack}d): test coordinator` }
      }
      return original(message)
    }
  })
  await page.getByPlaceholder("custom days").fill("21")
  await page.getByRole("button", { name: "Sync custom" }).click()
  await expect(page.getByText("manual sync (21d): test coordinator")).toBeVisible()
  expect(await page.evaluate(() => (window as any).__manualSyncMessage.daysBack)).toBe(21)

  await page.getByLabel("Keep history for").selectOption("90")
  await expect.poll(async () => page.evaluate(async () => {
    const meta = (await chrome.storage.local.get("yl.v2.meta"))["yl.v2.meta"]
    return (meta as { settings: { retentionDays: number | null } }).settings.retentionDays
  })).toBe(90)

  const csvPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Export CSV ledger/ }).click()
  const csvDownload = await csvPromise
  const csvPath = await csvDownload.path()
  expect(readFileSync(csvPath!, "utf8")).toContain("date,videoId,title,channel,category,subcategory")
  expect(readFileSync(csvPath!, "utf8")).toContain("World news")

  const jsonPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Export JSON backup/ }).click()
  const jsonDownload = await jsonPromise
  const jsonText = readFileSync((await jsonDownload.path())!, "utf8")
  expect(JSON.parse(jsonText).data.subcategories.some((sub: { id: string }) => sub.id === "news-world")).toBe(true)

  const uploadInput = page.locator('input[type="file"][accept="application/json"]')
  await uploadInput.setInputFiles({ name: "roundtrip.json", mimeType: "application/json", buffer: Buffer.from(jsonText) })
  page.once("dialog", (dialog) => void dialog.accept())
  await expect(page.getByRole("status").filter({ hasText: /restored 3 video/ })).toBeVisible()
  await expect.poll(async () => page.evaluate(async () => {
    const state = await chrome.storage.local.get("yl.v2.subcategories")
    return (state["yl.v2.subcategories"] as Array<{ id: string }>).some((sub) => sub.id === "news-world")
  })).toBe(true)

  const liveSeed = readFileSync("fixtures/qa-seed-live.json", "utf8")
  await page.getByLabel("Import from pasted JSON").fill(liveSeed)
  page.once("dialog", (dialog) => void dialog.accept())
  await page.getByRole("button", { name: "Import pasted JSON" }).click()
  await expect(page.getByRole("status").filter({ hasText: /restored 7 video/ })).toBeVisible()
  await expect.poll(async () => page.evaluate(async () => {
    const state = await chrome.storage.local.get("yl.v2.categories")
    return (state["yl.v2.categories"] as Array<{ id: string }>).some((category) => category.id === "qa-live-title")
  })).toBe(true)
  mkdirSync("qa/e2e/settings", { recursive: true })
  await page.screenshot({ path: "qa/e2e/settings/dashboard.png", fullPage: true })
})
