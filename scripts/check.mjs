#!/usr/bin/env node
// The one command to run before handing off or pushing. Plain Node, no dependencies.
//
//   node scripts/check.mjs         validate, test, rebuild; tells you what to commit
//   node scripts/check.mjs --ci    the same, and fails if the committed pages are stale
//
// It runs, in order:
//   1. validate.mjs on every incident and on the made-up sample
//   2. the tests in scripts/tests/ (they prove each rule still catches its mistake)
//   3. build.mjs in place
//   4. a comparison of the built pages with what is committed
//
// Step 4 is what catches a page edited by hand, and data pushed without a rebuild:
// the build is repeatable, so rebuilding committed data must change nothing.
// A failed check is never bypassed (operations manual 7.3).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ci = process.argv.includes("--ci");
const run = (label, cmd, args) => {
  console.log(`\n== ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) { console.error(`\nFAILED: ${label}. Fix it; do not bypass it.`); process.exit(1); }
};
const node = process.execPath;
const sampleBase = join(ROOT, "format", "sample");
const samples = readdirSync(sampleBase).map((d) => join("format", "sample", d));
const tests = readdirSync(join(ROOT, "scripts", "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => join("scripts", "tests", f));

run("Validate every incident", node, ["scripts/validate.mjs"]);
run("Validate the sample incident", node, ["scripts/validate.mjs", ...samples]);
run("Test the checks themselves", node, ["--test", "--test-reporter=spec", ...tests]);
run("Build the site", node, ["scripts/build.mjs"]);

console.log("\n== Compare the built pages with what is committed");
const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
if (status.status !== 0) { console.error("Could not run git status."); process.exit(1); }
const changed = status.stdout.split("\n").filter(Boolean);
if (!changed.length) { console.log("Nothing to commit: the committed pages match the data.\n\nAll checks passed."); process.exit(0); }
console.log(changed.join("\n"));
if (ci) {
  console.error("\nFAILED: the files above differ from a fresh build, or are not committed.\nEither a built page was edited by hand, or data was changed without running the build.\nRun `node scripts/check.mjs`, commit everything it changes, and push again.");
  process.exit(1);
}
console.log("\nAll checks passed. The files above are not committed yet: commit them together, data and built pages in one change.");
