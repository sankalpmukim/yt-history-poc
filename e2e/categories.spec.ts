import { test, expect } from "./fixtures"

test("Category ladder drag reorder, subcategory reorder, archive and derived ranks", async ({ ledger }) => {
  const { page, seed } = ledger
  await seed()
  await page.getByRole("link", { name: /Categories/ }).click()
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible()

  await expect(page.locator("body")).not.toContainText(/0–5|0-5|\b[0-5]\s*\/\s*5\b/)
  const categoriesBefore = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.categories"))["yl.v2.categories"] as Array<{ id: string; order: number; valueScore: number }>)
  expect(categoriesBefore[0].id).toBe("deep")
  const lowCategory = page.getByTestId("category-item-news")
  const highCategory = page.getByTestId("category-item-deep")
  await lowCategory.getByRole("button", { name: /Reorder category/ }).dragTo(highCategory.locator(".category-main-row"))
  await expect.poll(async () => page.evaluate(async () => ((await chrome.storage.local.get("yl.v2.categories"))["yl.v2.categories"] as Array<{ id: string }>)[0].id)).toBe("news")
  await highCategory.getByRole("button", { name: /Reorder category/ }).focus()
  await page.keyboard.press("ArrowUp")
  await expect.poll(async () => page.evaluate(async () => ((await chrome.storage.local.get("yl.v2.categories"))["yl.v2.categories"] as Array<{ id: string; valueScore: number }>)[0].id)).toBe("deep")
  const derivedScores = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.categories"))["yl.v2.categories"] as Array<{ valueScore: number }>)
  expect(derivedScores.map((category) => category.valueScore)).toEqual([5, 3, 0])

  const news = page.getByTestId("category-item-news")
  await news.getByRole("button", { name: "Archive" }).first().click()
  await expect(news.getByRole("button", { name: "Unarchive" }).first()).toBeVisible()
  const originalVideos = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.videos"))["yl.v2.videos"] as Record<string, { autoCategoryId: string | null }>)
  expect(originalVideos.ylqa0000001.autoCategoryId).toBe("news-world")

  const practical = page.getByTestId("category-item-practical")
  await practical.getByRole("button", { name: "+ sub" }).click()
  const createdSub = page.getByTestId("subcategory-item-practical-new")
  await createdSub.getByLabel("New subcategory name").fill("QA lab")
  const renamedSub = page.getByTestId("subcategory-item-practical-new")
  await renamedSub.getByRole("button", { name: /Reorder QA lab within/ }).dragTo(page.getByTestId("subcategory-item-practical-coding"))
  const storedSubs = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.subcategories"))["yl.v2.subcategories"] as Array<{ id: string; name: string; order: number; archivedAt?: string }>)
  const qaSub = storedSubs.find((sub) => sub.name === "QA lab")
  expect(qaSub?.order).toBe(0)

  const reorderedSub = page.getByTestId("subcategory-item-practical-new")
  await reorderedSub.getByRole("button", { name: "Archive" }).click()
  const archivedSubs = await page.evaluate(async () => (await chrome.storage.local.get("yl.v2.subcategories"))["yl.v2.subcategories"] as Array<{ id: string; name: string; archivedAt?: string }>)
  expect(archivedSubs.find((sub) => sub.id === qaSub?.id)?.archivedAt).toBeTruthy()
  await expect(reorderedSub.getByRole("button", { name: "Unarchive" })).toBeVisible()
  await expect(reorderedSub.getByRole("button", { name: /delete/i })).toHaveCount(0)
})
