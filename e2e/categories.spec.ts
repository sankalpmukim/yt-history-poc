import { test, expect } from "./fixtures"

test("Category score/archive and subcategory create, rename, reorder, archive safely", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Categories/ }).click()
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible()

  const news = page.locator(".card > .queueitem").filter({ has: page.locator('input[value="News & updates"]') })
  await news.getByRole("combobox").selectOption("1")
  await expect(news.getByRole("combobox")).toHaveValue("1")
  await news.getByRole("button", { name: "Archive" }).first().click()
  await expect(news.getByRole("button", { name: "Unarchive" }).first()).toBeVisible()
  const originalVideos = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.videos"))["yl.v2.videos"] as Record<string, { autoCategoryId: string | null }>)
  expect(originalVideos.ylqa0000001.autoCategoryId).toBe("news-world")

  const practical = page.locator(".card > .queueitem").filter({ has: page.locator('input[value="Practical how-tos"]') })
  await practical.getByRole("button", { name: "+ sub" }).click()
  const createdSub = page.locator(".queueitem").filter({ has: page.locator('input[value="New subcategory"]') }).last()
  const subName = createdSub.locator('input[type="text"]').nth(1)
  await subName.fill("QA lab")
  const renamedSub = page.locator(".queueitem").filter({ has: page.locator('input[value="QA lab"]') }).last()
  await expect(renamedSub).toBeVisible()
  await renamedSub.getByRole("button", { name: "↑" }).click()
  const storedSubs = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.subcategories"))["yl.v2.subcategories"] as Array<{ id: string; name: string; order: number; archivedAt?: string }>)
  const qaSub = storedSubs.find((sub) => sub.name === "QA lab")
  expect(qaSub?.order).toBe(1)

  const reorderedSub = page.locator(".queueitem").filter({ has: page.locator('input[value="QA lab"]') }).last()
  await reorderedSub.getByRole("button", { name: "Archive" }).click()
  const archivedSubs = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.subcategories"))["yl.v2.subcategories"] as Array<{ id: string; name: string; archivedAt?: string }>)
  expect(archivedSubs.find((sub) => sub.id === qaSub?.id)?.archivedAt).toBeTruthy()
  await expect(reorderedSub.getByRole("button", { name: "Unarchive" })).toBeVisible()
  await expect(reorderedSub.getByRole("button", { name: /delete/i })).toHaveCount(0)
})
