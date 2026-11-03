import { test, expect } from "./fixtures"

test("Ledger search, subcategory filter, bulk assign/clear, and single-row subcategory label", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Ledger/ }).click()
  await expect(page.getByRole("heading", { name: "Ledger" })).toBeVisible()

  const search = page.getByPlaceholder("Search title or channel…")
  await search.fill("airline fleet")
  const matchingRow = page.getByRole("row").filter({ hasText: "airline fleet news" })
  await expect(matchingRow).toHaveCount(1)

  await search.clear()
  await page.locator("select").selectOption("news-world")
  const filteredRows = page.locator("table.ledger tbody tr")
  await expect(filteredRows).toHaveCount(2)
  await expect(filteredRows.first()).toContainText("News & updates › World news")

  await page.locator("select").selectOption("all")
  await search.fill("airline fleet")
  const row = page.getByRole("row").filter({ hasText: "airline fleet news" })
  await row.locator('input[type="checkbox"]').check()
  await page.locator("#bulkcat").selectOption("practical-coding")
  await page.getByRole("button", { name: "Assign", exact: true }).click()
  await expect(row).toContainText("Practical how-tos › Coding")

  await row.locator('input[type="checkbox"]').check()
  await page.getByRole("button", { name: "Clear overrides" }).click()
  await expect(row).toContainText("News & updates › World news")

  await search.fill("aircraft industry")
  const singleRow = page.getByRole("row").filter({ hasText: "aircraft industry update" })
  await singleRow.locator("button.chip").click()
  await page.getByRole("button", { name: /Practical how-tos › Coding/ }).click()
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await expect(singleRow).toContainText("Practical how-tos › Coding")
})
