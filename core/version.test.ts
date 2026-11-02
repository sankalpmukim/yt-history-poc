import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { APP_VERSION } from "./version"

test("APP_VERSION stays in sync with package.json", () => {
  // Tests are bundled into .test/ (nested by source dir), so resolve from cwd.
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"))
  assert.equal(APP_VERSION, pkg.version)
})
