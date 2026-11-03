import { test, expect } from "./fixtures"

test("Overview and Insights drill-down/back totals agree with Ledger; subcategory budget rolls up", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()

  const overviewTotal = (await page.locator(".reading-number").innerText()).trim()
  await page.getByRole("button", { name: "Drill into News & updates" }).click()
  await expect(page.getByRole("button", { name: "← All categories" })).toBeVisible()
  await expect(page.locator(".value-details")).toContainText("World news")
  await page.getByRole("button", { name: "← All categories" }).click()

  await page.getByRole("link", { name: /Ledger/ }).click()
  await expect(page.locator(".card").first()).toContainText(new RegExp(`3 event\\(s\\) · ${overviewTotal}`))

  await page.getByRole("link", { name: /Insights/ }).click()
  const highValueChannel = page.getByRole("button", { name: "Drill into Simple Flying high-value watch time" })
  await expect(highValueChannel).toBeVisible()
  await expect(highValueChannel).toContainText("10m")
  await highValueChannel.click()
  await expect(page.getByRole("heading", { name: "Breakdown · Simple Flying" })).toBeVisible()
  const insightBreakdown = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Breakdown · Simple Flying" }) })
  await expect(insightBreakdown.locator("b")).toHaveText("10m")
  await page.getByRole("button", { name: "← All insights" }).click()

  await page.getByRole("link", { name: /Ledger/ }).click()
  await page.locator("select").selectOption("practical")
  await expect(page.locator(".card").first()).toContainText("1 event(s) · 10m")

  await page.getByRole("link", { name: /Budgets/ }).click()
  const newsBudget = page.locator(".queueitem").filter({ hasText: "News & updates" })
  await expect(newsBudget).toContainText("30m spent / 1m")
  await expect(newsBudget).toContainText("29m over")
})
