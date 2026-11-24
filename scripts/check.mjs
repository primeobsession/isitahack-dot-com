#!/usr/bin/env node
// The one command to run before handing off or pushing. Plain Node, no dependencies.
//
//   node scripts/check.mjs
//
// It runs, in order:
//   1. validate.mjs on every incident and on the made-up sample
//   2. the tests in scripts/tests/ (they prove each rule still catches its mistake)
//   3. a comparison with main: a new log row filed as an update must name a claim the same
//      change added or altered (changes.mjs)
//   4. build.mjs, which writes the whole site into _site/
//   5. a look for built pages that were committed by mistake
//
// The site is built by GitHub on every push to main (.github/workflows/deploy.yml), with this
// same command. Built pages are never committed: a change to a story is a change to its data.
// A failed check is never bypassed (operations manual 7.3).

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltPage } from "./build.mjs";
import { checkUpdates } from "./changes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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

// An update has to change something. This needs main to compare with: on GitHub the workflow
// names the commit (CHECK_BASE); on your machine it is where your branch left origin/main.
console.log("\n== Compare new log rows with main");
const updates = checkUpdates(ROOT);
if (!updates.base) console.log("No main to compare with here (no git history); GitHub runs this comparison on every push.");
else if (updates.problems.length) {
  console.error(updates.problems.join("\n"));
  console.error("\nFAILED: the log rows above are filed as updates, but the change does not add or alter the claims they name. A check that found nothing new is checked_no_change. Fix the row; do not bypass it.");
  process.exit(1);
} else console.log(updates.checked ? `${updates.checked} ${updates.checked === 1 ? "story has" : "stories have"} a changed log; every new update names a claim that changed.` : "No story's log differs from main.");

run("Build the site into _site/", node, ["scripts/build.mjs"]);

// A page the build writes must not be in the repository: it would go stale, and it makes every
// branch conflict with every other. An incident's hand-written page is only a source while the
// incident has no data folder.
console.log("\n== Look for built pages committed by mistake");
const tracked = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
if (tracked.status !== 0) { console.error("Could not run git ls-files."); process.exit(1); }
const hasData = (slug) => existsSync(join(ROOT, "data", "incidents", slug, "incident.json"));
const stray = tracked.stdout.split("\n").filter((f) => f && isBuiltPage(f, hasData));
if (stray.length) {
  console.error(`${stray.slice(0, 12).join("\n")}${stray.length > 12 ? `\n...and ${stray.length - 12} more` : ""}`);
  console.error("\nFAILED: the files above are built pages and must not be committed. Remove them from the commit (git rm --cached <file>); the site is built when it is published.");
  process.exit(1);
}
console.log("None.\n\nAll checks passed. The site is in _site/ for you to look at; it is not committed. Commit the data you changed, and llms.txt if you added an incident.");
