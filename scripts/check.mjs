#!/usr/bin/env node
// The one command to run before handing off or pushing. Plain Node, no dependencies.
//
//   node scripts/check.mjs
//
// It runs, in order:
//   1. validate.mjs on every incident and on the made-up sample
//   2. the tests in scripts/tests/ (they prove each rule still catches its mistake)
//   3. build.mjs, which writes the whole site into _site/
//
// The site is built by GitHub on every push to main (.github/workflows/deploy.yml), with this
// same command. Built pages are never committed: a change to a story is a change to its data.
// A failed check is never bypassed (operations manual 7.3).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
run("Build the site into _site/", node, ["scripts/build.mjs"]);

console.log("\nAll checks passed. The site is in _site/ for you to look at; it is not committed.");
