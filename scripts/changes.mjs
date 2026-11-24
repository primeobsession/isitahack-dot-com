// An update has to change something. Plain Node, no dependencies.
//
// A log row filed as added, updated or label_change moves the page's "Last updated" time and
// becomes "The latest" at the top of the page. So it must name, in claim_ids, at least one
// claim that the same change added or altered, or that a question the change answered or
// relabelled rests on. A run that added no source and changed no claim is a check, and is
// filed as checked_no_change (operations manual 3 and 4.11).
//
// This cannot be told from one copy of the data, so check.mjs compares the working copy with
// the version on main. Only log rows that are not on main yet are judged.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./validate.mjs";

const UPDATES = new Set(["added", "updated", "label_change"]);
// Re-checking a claim moves this date and nothing else; that alone is not a change.
const CHECK_DATES = new Set(["last_checked"]);

function records(text) {
  if (!text) return [];
  const rows = parseCsv(text, "", []);
  const head = rows[0] || [];
  return rows.slice(1).filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const ids = (cell) => String(cell || "").split(";").map((s) => s.trim()).filter(Boolean);
const differs = (a, b) => Object.keys({ ...a, ...b }).some((k) => !CHECK_DATES.has(k) && (a[k] ?? "") !== (b[k] ?? ""));

// before and after are { claims, questions, update_log }: the text of each file, or "" where
// there is none. Returns one problem per new update row that names no claim this change added
// or altered. A claim also counts when a question that rests on it is new, or has a new answer
// or label: answering an open question from what the story already holds is a real update.
export function emptyUpdates(before, after) {
  const logged = new Set(records(before.update_log).map((r) => r.log_id));
  const was = new Map(records(before.claims).map((c) => [c.claim_id, c]));
  const asked = new Map(records(before.questions).map((q) => [q.question_id, q]));
  const changed = new Set(records(after.claims).filter((c) => !was.has(c.claim_id) || differs(c, was.get(c.claim_id))).map((c) => c.claim_id));
  for (const q of records(after.questions)) if (!asked.has(q.question_id) || differs(q, asked.get(q.question_id))) ids(q.claim_ids).forEach((id) => changed.add(id));
  const problems = [];
  for (const r of records(after.update_log)) {
    if (logged.has(r.log_id) || !UPDATES.has(r.change_type)) continue;
    const named = ids(r.claim_ids);
    const fix = "If the run added no source and changed no claim, file the row as checked_no_change";
    if (!named.length) problems.push(`update_log.csv ${r.log_id}: filed as ${r.change_type} but names no claim. Put the claims this run added or changed in claim_ids. ${fix}`);
    else if (!named.some((id) => changed.has(id))) problems.push(`update_log.csv ${r.log_id}: filed as ${r.change_type}, but ${named.join(", ")} ${named.length === 1 ? "is" : "are"} the same as on main apart from the check date, and no question resting on ${named.length === 1 ? "it" : "them"} has a new answer. ${fix}`);
  }
  return problems;
}

// ---------- comparing the working copy with main ----------
const git = (root, args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const resolves = (root, ref) => Boolean(ref) && !/^0+$/.test(ref) && git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).status === 0;

// The commit to compare with: CHECK_BASE when the workflow gives one, otherwise where this
// branch left main. Returns "" when there is nothing to compare with (no git, or no main).
export function baseCommit(root, wanted = process.env.CHECK_BASE) {
  if (resolves(root, wanted)) return wanted;
  for (const main of ["origin/main", "main"]) {
    if (!resolves(root, main)) continue;
    const fork = git(root, ["merge-base", "HEAD", main]);
    if (fork.status === 0 && fork.stdout.trim()) return fork.stdout.trim();
  }
  return "";
}

// Every story whose log differs from the base, judged. Returns { base, checked, problems }.
export function checkUpdates(root, base = baseCommit(root)) {
  if (!base) return { base: "", checked: 0, problems: [] };
  const dir = "data/incidents";
  const list = (args) => { const r = git(root, args); return r.status === 0 ? r.stdout.split("\n").filter(Boolean) : []; };
  const touched = [...list(["diff", "--name-only", base, "--", dir]), ...list(["ls-files", "--others", "--exclude-standard", "--", dir])];
  const slugs = [...new Set(touched.map((f) => f.match(/^data\/incidents\/([^/]+)\/update_log\.csv$/)?.[1]).filter(Boolean))].sort();
  const problems = [];
  for (const slug of slugs) {
    const now = (file) => { const p = join(root, dir, slug, file); return existsSync(p) ? readFileSync(p, "utf8") : ""; };
    const then = (file) => { const r = git(root, ["show", `${base}:${dir}/${slug}/${file}`]); return r.status === 0 ? r.stdout : ""; };
    const files = (read) => ({ claims: read("claims.csv"), questions: read("questions.csv"), update_log: read("update_log.csv") });
    const found = emptyUpdates(files(then), files(now));
    problems.push(...found.map((p) => `${dir}/${slug}/${p}`));
  }
  return { base, checked: slugs.length, problems };
}
