import { test, expect } from "./fixtures"

test("Overview and Insights drill-down/back totals agree with Ledger; subcategory budget rolls up", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await expect(page.locator("body")).not.toContainText(/0–5|0-5|\b[0-5]\s*\/\s*5\b|score [≤≥]/)

  const overviewTotal = (await page.locator(".reading-number").innerText()).trim()
  await page.getByRole("button", { name: "Drill into News & updates" }).click()
  await expect(page.getByRole("button", { name: "All categories", exact: true })).toBeVisible()
  await expect(page.locator(".value-details")).toContainText("World news")
  await page.getByRole("button", { name: "All categories", exact: true }).click()

  await page.getByRole("link", { name: /Ledger/ }).click()
  await expect(page.locator(".card").first()).toContainText(`${overviewTotal} in 3 watches`)

  await page.getByRole("link", { name: /Insights/ }).click()
  const lowValueChannel = page.getByRole("button", { name: "Drill into Simple Flying low-value watch time" })
  await expect(lowValueChannel).toBeVisible()
  await expect(lowValueChannel).toContainText("30m")
  await lowValueChannel.click()
  await expect(page.getByRole("heading", { name: "Simple Flying", exact: true })).toBeVisible()
  const insightBreakdown = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Simple Flying", exact: true }) })
  await expect(insightBreakdown.locator("b")).toHaveText("30m")
  await page.getByRole("button", { name: "All insights", exact: true }).click()

  await page.getByRole("link", { name: /Ledger/ }).click()
  await page.locator("select").selectOption("practical")
  await expect(page.locator(".card").first()).toContainText("10m in 1 watch")

  await page.getByRole("link", { name: /Budgets/ }).click()
  const newsBudget = page.locator(".queueitem").filter({ hasText: "News & updates" })
  await expect(newsBudget).toContainText("30m of 1m")
  await expect(newsBudget).toContainText("29m over")
})
