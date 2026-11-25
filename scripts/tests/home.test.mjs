// The front of the home page: which stories are on it, in what order, and what the
// Editor-in-Chief's picks (data/front-page.json) may and may not do.
// Run with: node --test scripts/tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { asOfOf, checkFrontPage, activePicks, isFresh, frontBands, liveUpdates, sizeBars, NO_PICKS } from "../home.mjs";

// A made-up incident with only what the front page reads. "Now" in these tests is the newest
// check among the incidents passed in: Jan 20, 2026, noon, unless a test says otherwise.
const NOW = "2026-01-20T12:00:00-05:00";
function story(slug, over = {}) {
  const base = {
    slug, typed: true, title: `${slug} incident`, status: "monitoring", size: "Large", answer_group: "unclear",
    incident_date: "2026-01-18", first_published: "2026-01-18T09:00:00-05:00",
    last_updated: "2026-01-19T09:00:00-05:00", last_checked: NOW, service: null,
    subject: { name: slug, kind: "other" }, question: { text: `Was ${slug} hacked?`, answer: "Not established." },
    latest: { headline: `${slug} latest` },
  };
  const i = { ...base, ...over };
  i.loaded = { t: { update_log: over.log || [{ logged_at: i.last_updated, change_type: "updated", headline: `${slug} latest` }, { logged_at: i.first_published, change_type: "added", headline: `${slug} opened` }] } };
  return i;
}
const slugsOf = (band) => [...band.big, ...band.side, ...band.rows].map((i) => i.slug);
const bandOf = (front, key) => front.bands.find((b) => b.key === key);
const picksOf = (doc, slugs) => checkFrontPage(JSON.stringify({ updated: NOW, ...doc }), new Set(slugs));

test("the build's clock is the newest check in any incident", () => {
  assert.equal(asOfOf([story("a", { last_checked: "2026-01-19T08:00:00-05:00" }), story("b", { last_checked: "2026-01-20T11:00:00-05:00" }), story("c", { last_checked: "2026-01-20T15:59:00+00:00" })]), "2026-01-20T11:00:00-05:00");
  assert.equal(asOfOf([]), null);
});

test("a story is on the front while it is recent, newly opened or still down", () => {
  const on = activePicks(NO_PICKS, NOW);
  assert.equal(isFresh(story("recent", { incident_date: "2026-01-13" }), NOW, on), true, "seven days old is still recent");
  assert.equal(isFresh(story("old", { incident_date: "2026-01-12", first_published: "2026-01-12T09:00:00-05:00" }), NOW, on), false, "eight days old is not");
  assert.equal(isFresh(story("old-down", { incident_date: "2025-12-01", first_published: "2025-12-01T09:00:00-05:00", service: { state: "down" } }), NOW, on), true, "an old story stays while something is down");
  assert.equal(isFresh(story("old-partly", { incident_date: "2025-12-01", first_published: "2025-12-01T09:00:00-05:00", service: { state: "partly-back" } }), NOW, on), true, "or partly back");
  assert.equal(isFresh(story("old-back", { incident_date: "2025-12-01", first_published: "2025-12-01T09:00:00-05:00", service: { state: "back" } }), NOW, on), false, "but not once it is back");
  assert.equal(isFresh(story("old-new", { incident_date: "2025-12-01", first_published: "2026-01-19T09:00:00-05:00" }), NOW, on), true, "an old incident we opened yesterday is new to readers");
  assert.equal(isFresh(story("resolved", { status: "resolved" }), NOW, on), false, "a resolved story has left the front");
  assert.equal(isFresh(story("legacy", { typed: false }), NOW, on), false, "a hand-written page has no size to file it under");
});

test("an old story with a fresh update does not come back to the bands, only to the live updates", () => {
  const old = story("old", { incident_date: "2026-01-02", first_published: "2026-01-02T09:00:00-05:00", last_updated: "2026-01-20T10:00:00-05:00" });
  const front = frontBands([old, story("recent")]);
  assert.deepEqual(front.bands.flatMap(slugsOf), ["recent"]);
  assert.deepEqual(liveUpdates([old, story("recent")], front.asOf).rows.map((u) => u.i.slug).slice(0, 1), ["old"], "its update still leads the live list");
});

test("bands run from biggest to smallest, and each orders its stories", () => {
  const front = frontBands([
    story("local", { size: "Local" }), story("regional", { size: "Regional" }),
    story("large-old", { last_updated: "2026-01-18T09:00:00-05:00" }), story("large-new", { last_updated: "2026-01-20T09:00:00-05:00" }),
    story("maybe", { size: "Nation-level potential", last_updated: "2026-01-20T11:00:00-05:00" }), story("nation", { size: "Nation-level", last_updated: "2026-01-18T10:00:00-05:00" }),
  ]);
  assert.deepEqual(front.bands.map((b) => b.key), ["nation", "large", "regional", "local"]);
  assert.deepEqual(slugsOf(bandOf(front, "nation")), ["nation", "maybe"], "an established size comes before a potential one, however fresh");
  assert.deepEqual(slugsOf(bandOf(front, "large")), ["large-new", "large-old"], "then the most recently updated");
  assert.equal(frontBands([story("only", { size: "Local" })]).bands.length, 1, "a band with no stories is left out");
});

test("a band shows only so many stories and counts the rest", () => {
  const many = Array.from({ length: 12 }, (_, n) => story(`s${String(n).padStart(2, "0")}`, { last_updated: `2026-01-19T${String(10 + n).padStart(2, "0")}:00:00-05:00`, last_checked: n === 0 ? NOW : "2026-01-19T23:00:00-05:00" }));
  const large = bandOf(frontBands(many), "large");
  assert.equal(large.big.length, 0);
  assert.equal(large.side.length, 4);
  assert.equal(large.rows.length, 4);
  assert.equal(large.more, 4, "the rest are counted and linked to the full list");
  assert.equal(large.total, 12);
});

test("the editor's picks: lead, keep, hold and a line", () => {
  const old = { incident_date: "2025-12-01", first_published: "2025-12-01T09:00:00-05:00" };
  const all = [story("a", { last_updated: "2026-01-20T11:00:00-05:00" }), story("b"), story("c", { last_updated: "2026-01-18T09:00:00-05:00" }), story("kept", old), story("led", old)];
  const { errs, picks } = picksOf({ lead: ["c", "led"], keep: [{ slug: "kept", until: "2026-01-25" }], hold: [{ slug: "b", until: "2026-01-25", reason: "Duplicates the story above." }], lines: [{ slug: "c", text: "The sign-up deadline is Friday." }] }, all.map((i) => i.slug));
  assert.deepEqual(errs, []);
  const front = frontBands(all, picks);
  assert.deepEqual(slugsOf(bandOf(front, "large")), ["c", "led", "a", "kept"], "lead picks go first in the order given, a kept story stays on, a held one is left off");
  assert.equal(front.on.lines.get("c"), "The sign-up deadline is Friday.");
});

test("picks lapse on their own, so an untended front page falls back to the rules", () => {
  const all = [story("a", { last_updated: "2026-01-20T11:00:00-05:00" }), story("b", { last_updated: "2026-01-18T09:00:00-05:00" }), story("old", { incident_date: "2025-12-01", first_published: "2025-12-01T09:00:00-05:00" })];
  const stale = checkFrontPage(JSON.stringify({ updated: "2026-01-18T11:00:00-05:00", lead: ["b"], lines: [{ slug: "b", text: "Still the one to watch." }], keep: [{ slug: "old", until: "2026-01-19" }], hold: [{ slug: "a", until: "2026-01-19", reason: "Held for a day." }] }), new Set(["a", "b", "old"]));
  assert.deepEqual(stale.errs, []);
  const front = frontBands(all, stale.picks);
  assert.deepEqual(slugsOf(bandOf(front, "large")), ["a", "b"], "49 hours after the last update the lead pick is gone; a keep and a hold end on their day");
  assert.equal(front.on.lines.size, 0);
  const tended = checkFrontPage(JSON.stringify({ updated: "2026-01-18T12:00:00-05:00", lead: ["b"] }), new Set(["a", "b", "old"]));
  assert.deepEqual(slugsOf(bandOf(frontBands(all, tended.picks), "large")), ["b", "a"], "at exactly 48 hours it still holds");
});

test("the picks file is checked", () => {
  const slugs = ["a", "b"];
  const bad = (doc, pattern, raw) => { const { errs } = raw === undefined ? picksOf(doc, slugs) : checkFrontPage(raw, new Set(slugs)); assert.ok(errs.some((e) => pattern.test(e)), `expected ${pattern}, got ${JSON.stringify(errs)}`); };
  assert.deepEqual(picksOf({}, slugs).errs, [], "every list may be left out");
  bad(null, /not valid JSON/, "{ lead: ");
  bad(null, /must be one JSON object/, "[]");
  bad(null, /updated must be a full timestamp/, JSON.stringify({ lead: [] }));
  bad({ updated: "2026-01-20" }, /updated must be a full timestamp/);
  bad({ top: ["a"] }, /"top" is not a field/);
  bad({ lead: "a" }, /lead must be a list/);
  bad({ lead: ["zzz"] }, /lead: "zzz" is not an incident on the site/);
  bad({ lead: ["a", "a"] }, /lead: "a" is listed twice/);
  bad({ keep: [{ slug: "a" }] }, /keep a: until must be a day/);
  bad({ keep: [{ slug: "a", until: "2026-03-01" }] }, /until is more than 14 days after updated/);
  bad({ hold: [{ slug: "a", until: "2026-01-25" }] }, /hold a: say why in reason/);
  bad({ lead: ["a"], hold: [{ slug: "a", until: "2026-01-25", reason: "x" }] }, /"a" is held back and also picked/);
  bad({ lines: [{ slug: "a", text: " " }] }, /lines a: text is empty/);
  bad({ lines: [{ slug: "a", text: "x".repeat(161) }] }, /text is 161 characters; at most 160/);
  bad({ lines: [{ slug: "a", text: "Looks like a confirmed hack." }] }, /verdict words/);
  bad({ lines: [{ slug: "a", text: "Confirmed not a hack, probably." }] }, /verdict words/);
  bad({ lead: Array.from({ length: 9 }, (_, n) => `s${n}`) }, /is not an incident/);
});

test("live updates: real changes only, newest first, with the kind of change", () => {
  const log = [
    { logged_at: "2026-01-20T11:30:00-05:00", change_type: "checked_no_change", headline: "Nothing new." },
    { logged_at: "2026-01-20T10:00:00-05:00", change_type: "correction", headline: "Corrected the count." },
    { logged_at: "2026-01-20T09:30:00-05:00", change_type: "presentation", headline: "Picture added." },
    { logged_at: "2026-01-20T09:00:00-05:00", change_type: "label_change", headline: "Now Confirmed." },
    { logged_at: "2026-01-19T20:00:00-05:00", change_type: "added", headline: "Opened." },
  ];
  const a = story("a", { log, last_updated: "2026-01-20T10:00:00-05:00", first_published: "2026-01-19T20:00:00-05:00", service: { state: "down" } });
  const { rows, quiet } = liveUpdates([a], NOW);
  assert.deepEqual(rows.map((u) => u.kind), ["Correction", "Label changed", "New story"], "a check that found nothing and a presentation change are not updates");
  assert.deepEqual(rows.map((u) => u.newest), [true, false, false], "only a story's newest change carries its down-now mark");
  assert.equal(quiet, 1, "the empty check is counted");
  const longAgo = story("b", { log: [{ logged_at: "2026-01-10T09:00:00-05:00", change_type: "added", headline: "Opened." }], last_updated: "2026-01-10T09:00:00-05:00", first_published: "2026-01-10T09:00:00-05:00" });
  assert.equal(liveUpdates([longAgo], NOW).rows.length, 1, "on a quiet day the list still shows the latest changes");
});

test("size bars: filled to the size, dashed when it is only potential", () => {
  assert.equal(sizeBars(3).match(/class="off"/g).length, 1);
  assert.equal(sizeBars(4).match(/<rect/g).length, 4);
  assert.doesNotMatch(sizeBars(4), /class="off"/);
  assert.equal(sizeBars(4, { potential: true }).match(/class="maybe"/g).length, 4);
  assert.match(sizeBars(2, { label: "Size: 2 of 4" }), /role="img" aria-label="Size: 2 of 4"/);
});
