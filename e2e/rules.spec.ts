import { test, expect } from "./fixtures"

test("Rules CRUD covers every condition, preview, invalid regex, and subcategory target", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Rules/ }).click()
  await page.getByRole("button", { name: "+ New rule" }).click()

  await page.getByLabel("Name").fill("QA all-conditions rule")
  await page.getByLabel("Category").selectOption("practical-coding")
  await page.getByLabel("Channel is exactly").fill("Simple Flying")
  await page.getByLabel("Channel contains").fill("Flying")
  await page.getByLabel("Title contains (comma-separated, any-of)").fill("fleet, tutorial")
  await page.getByLabel("Title regex").fill("news")
  await page.getByLabel("Flags").fill("i")
  await page.getByLabel("Shorts").selectOption("false")
  await page.getByLabel("Duration ≤ (sec)").fill("1000")
  await page.getByLabel("Priority").fill("5")
  await page.getByRole("button", { name: "Test run" }).click()
  await expect(page.getByText(/Would currently match 1 stored video/)).toBeVisible()

  await page.getByLabel("Title regex").fill("[")
  await page.getByRole("button", { name: "Test run" }).click()
  await expect(page.locator(".overlay")).toContainText(/Invalid regular expression/)
  await page.getByLabel("Title regex").fill("news")
  await page.getByRole("button", { name: "Save rule" }).click()

  const savedRule = page.locator(".queueitem").filter({ hasText: "QA all-conditions rule" })
  await expect(savedRule).toContainText("Practical how-tos › Coding")
  await savedRule.getByRole("button", { name: "Edit" }).click()
  await page.getByLabel("Name").fill("QA edited rule")
  await page.getByRole("button", { name: "Save rule" }).click()
  await expect(page.getByText("QA edited rule", { exact: true })).toBeVisible()

  const editedRule = page.locator(".queueitem").filter({ hasText: "QA edited rule" })
  await editedRule.getByRole("button", { name: "Delete" }).click()
  await editedRule.getByRole("button", { name: "really delete" }).click()
  await expect(page.getByText("QA edited rule", { exact: true })).toHaveCount(0)
})
