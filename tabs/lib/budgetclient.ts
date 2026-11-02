/** Ask the service worker to recompute the budget-status snapshot now. */

export async function refreshBudgetStatusClient(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "yl.refreshBudget" })
  } catch {
    // the SW also refreshes (debounced) on storage changes — this is just a nudge
  }
}
