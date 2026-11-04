import { test, expect } from "./fixtures"

test("Rules CRUD covers every condition, preview, invalid regex, and subcategory target", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Rules/ }).click()
  await page.getByRole("button", { name: "New rule" }).click()

  const editor = page.getByRole("dialog", { name: "New rule" })
  await editor.getByLabel("Name").fill("QA all-conditions rule")
  await page.getByRole("button", { name: "Choose rule category" }).click()
  await page.getByRole("combobox", { name: "Search categories and subcategories" }).fill("Coding")
  await page.getByRole("option", { name: "⌨️ Practical how-tos › Coding" }).click()
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await editor.getByLabel("Channel is exactly").fill("Simple Flying")
  await editor.getByLabel("Channel contains").fill("Flying")
  await editor.getByLabel("Title contains any of").fill("fleet, tutorial")
  await editor.getByLabel("Title regex").fill("news")
  await editor.getByLabel("Flags").fill("i")
  await editor.getByLabel("Shorts").selectOption("false")
  await editor.getByLabel("Max length in seconds").fill("1000")
  await editor.getByLabel("Priority").fill("5")
  await page.getByRole("button", { name: "Preview matches" }).click()
  await expect(page.getByText(/Matches 1 video you/)).toBeVisible()

  await editor.getByLabel("Title regex").fill("[")
  await page.getByRole("button", { name: "Preview matches" }).click()
  await expect(page.locator(".overlay")).toContainText(/Invalid regular expression/)
  await editor.getByLabel("Title regex").fill("news")
  await page.getByRole("button", { name: "Save rule" }).click()

  const savedRule = page.locator(".queueitem").filter({ hasText: "QA all-conditions rule" })
  await expect(savedRule).toContainText("Practical how-tos › Coding")
  await savedRule.getByRole("button", { name: "Edit" }).click()
  await page.getByRole("dialog").getByLabel("Name").fill("QA edited rule")
  await page.getByRole("button", { name: "Save rule" }).click()
  await expect(page.getByText("QA edited rule", { exact: true })).toBeVisible()

  const editedRule = page.locator(".queueitem").filter({ hasText: "QA edited rule" })
  await editedRule.getByRole("button", { name: "Delete" }).click()
  await editedRule.getByRole("button", { name: "Delete rule" }).click()
  await expect(page.getByText("QA edited rule", { exact: true })).toHaveCount(0)
})
