import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { APP_VERSION } from "./version"

test("APP_VERSION stays in sync with package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  assert.equal(APP_VERSION, pkg.version)
})
