import { mkdtempSync, readFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import assert from "node:assert/strict"

const root = process.cwd()
const folder = mkdtempSync(join(tmpdir(), "medusa-package-"))
try {
  execFileSync("corepack", ["pnpm", "pack", "--pack-destination", folder], {
    stdio: "pipe",
  })
  const metadata = JSON.parse(readFileSync("package.json", "utf8"))
  const archive = join(
    folder,
    metadata.name.replace("@", "").replace("/", "-") +
      "-" +
      metadata.version +
      ".tgz",
  )
  const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
  assert(!/(^|\/)\.env|\.pem$|\.key$|node_modules|tests\//m.test(listing))
  assert(listing.includes("package/dist/provider/index.js"))
  execFileSync("tar", ["-xzf", archive, "-C", folder])
  // Resolve peer dependencies from the cleanly installed test matrix. The tested
  // module itself is loaded only from the archive, never the source directory.
  symlinkSync(
    resolve(root, "node_modules"),
    join(folder, "node_modules"),
    "dir",
  )
  const require = createRequire(join(folder, "consumer.cjs"))
  assert(require("./package/dist/provider/index.js").default)
  assert(Object.keys(require("./package/dist/client/index.js")).length > 0)
  console.log(
    "Packed provider and client imports passed; no secrets or fixtures in archive",
  )
} finally {
  rmSync(folder, { recursive: true, force: true })
}
