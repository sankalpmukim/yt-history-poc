/**
 * Single source of truth for the shipped version string, stamped into
 * content-script/SW logs so "which build is live" is always answerable.
 * Kept in sync with package.json — enforced by version.test.ts.
 */
export const APP_VERSION = "0.13.1"
