// Proves that each rule in validate.mjs still catches what it is there to catch.
// Every case copies the made-up sample incident, breaks one thing, and expects the
// validator to name it. Run with: node --test scripts/tests/*.test.mjs
//
// If you change a rule, change its case here in the same commit. Never delete a
// case to get a green run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { validateIncident } from "../validate.mjs";
import { isBuiltPage } from "../build.mjs";
import { incidentPicture, nextCheck, cadenceText } from "../incident.mjs";
import { emptyUpdates } from "../changes.mjs";
import { renderPlate } from "../plate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLUG = "2026-01-example-city-water-portal";
const SAMPLE = join(ROOT, "format", "sample", SLUG);

// Copies the sample, lets `change` break it, and returns the validator's problems.
function problems(change) {
  const base = mkdtempSync(join(tmpdir(), "isitahack-test-"));
  const dir = join(base, SLUG);
  try {
    cpSync(SAMPLE, dir, { recursive: true });
    const tools = {
      dir,
      // Replace text in a file. The text must be there, or the test itself is wrong.
      swap(file, from, to) {
        const before = readFileSync(join(dir, file), "utf8");
        assert.ok(before.includes(from), `test setup: ${file} does not contain ${JSON.stringify(from)}`);
        writeFileSync(join(dir, file), before.replace(from, to));
      },
      head(fn) {
        const path = join(dir, "incident.json");
        const head = JSON.parse(readFileSync(path, "utf8"));
        fn(head);
        writeFileSync(path, JSON.stringify(head, null, 2) + "\n");
      },
    };
    change(tools);
    return validateIncident(dir);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
const expectProblem = (errs, pattern) => assert.ok(errs.some((e) => pattern.test(e)), `expected a problem matching ${pattern}, got:\n  ${errs.join("\n  ") || "(none)"}`);
const rule = (name, change, pattern) => test(name, () => expectProblem(problems(change), pattern));

test("the sample incident passes every check", () => {
  assert.deepEqual(problems(() => {}), []);
});

// ---------- shape of the files ----------
rule("an unknown field in incident.json is rejected", (t) => t.head((h) => { h.severity = "high"; }), /incident\.json\.severity: unknown field/);
rule("a missing required field is named", (t) => t.head((h) => { delete h.who_is_affected; }), /who_is_affected: missing \(required\)/);
rule("a value outside the allowed list is rejected", (t) => t.head((h) => { h.size = "Huge"; }), /incident\.json\.size: "Huge" is not one of/);
rule("the slug must equal the folder name", (t) => t.head((h) => { h.slug = "2026-01-something-else"; }), /slug: .* must equal the folder name/);
rule("a field over its length limit is rejected", (t) => t.head((h) => { h.known[0].text = "x".repeat(201); }), /known\[0\]\.text: too long/);
rule("a changed CSV header is rejected", (t) => t.swap("claims.csv", "claim_id,group,claim_text", "id,group,claim_text"), /claims\.csv: header row must be exactly/);
rule("a row with the wrong number of cells is rejected", (t) => t.swap("timeline.csv", "The portal is back online,c006,", "The portal is back online,c006"), /timeline\.csv row 5: has 7 cells, expected 8/);
rule("an id used twice is rejected", (t) => t.swap("claims.csv", "\nc002,", "\nc001,"), /claim_id: "c001" is used more than once/);
rule("CR line endings are rejected", (t) => t.swap("sources.csv", "last_checked\n", "last_checked\r\n"), /sources\.csv: has CR line endings/);
rule("a time without an offset is rejected", (t) => t.swap("timeline.csv", "t003,2026-01-12T13:00:00-05:00", "t003,2026-01-12T13:00:00"), /event_time: .* must be a date/);
rule("a label outside the six is rejected", (t) => t.swap("claims.csv", "no evidence offered.\",,Rumor,", "no evidence offered.\",,Likely,"), /label: "Likely" is not one of/);
rule("'N/A' is rejected in favour of an empty cell", (t) => t.swap("timeline.csv", "The portal is back online,c006,", "The portal is back online,c006,N/A"), /leave the cell empty instead of "N\/A"/);

// ---------- references between files ----------
rule("a claim citing a source that does not exist", (t) => t.swap("claims.csv", "Debunked,s002;s005,", "Debunked,s002;s099,"), /source_ids: "s099" is not in sources\.csv/);
rule("an event pointing at a claim that does not exist", (t) => t.swap("timeline.csv", "a software update failed,c001,", "a software update failed,c099,"), /claim_id: "c099" is not in claims\.csv/);
rule("a section naming a chart that is not defined", (t) => t.head((h) => { h.sections.find((s) => s.type === "chart").id = "missing-chart"; }), /no chart with id "missing-chart"/);
rule("a section naming a claim group with no rows", (t) => t.head((h) => { h.sections.find((s) => s.type === "claims").group = "nothing"; }), /no claims\.csv row has group "nothing"/);
rule("a main question that is not in questions.csv", (t) => t.head((h) => { h.main_question_id = "q099"; }), /main_question_id: "q099" is not in questions\.csv/);

// ---------- label rules ----------
rule("Confirmed on a single news outlet is rejected", (t) => t.swap("claims.csv", "Confirmed,s003;s004,", "Confirmed,s003,"), /Confirmed needs a Tier 1 source, or two Tier 2\/3 sources/);
rule("Confirmed on two outlets repeating one report is rejected", (t) => t.swap("sources.csv", "Example Wire,2,example-wire,", "Example Wire,2,example-daily,"), /Confirmed needs a Tier 1 source, or two Tier 2\/3 sources/);
rule("a 'known' item resting on a claim that is not Confirmed", (t) => t.head((h) => { h.known[0].claim_id = "c003"; }), /only Confirmed claims can be listed as known/);
rule("a social post ranked as an official source", (t) => t.swap("sources.csv", "s001,https://water.example.org/status,", "s001,https://x.com/examplewater/status/1,"), /a post on a social platform is Tier 4 or 5/);
rule("a dead link with no archived copy", (t) => t.swap("sources.csv", "2026-01-12T10:30:00-05:00,,ok,", "2026-01-12T10:30:00-05:00,,dead,"), /archive_url: required when link_status is dead/);

// ---------- questions and the page title ----------
rule("a main question that does not name its subject", (t) => t.swap("questions.csv", "Was the Example City water portal outage a hack?", "Was it a hack?"), /the main question must name its subject/);
rule("a main question with no question mark", (t) => t.swap("questions.csv", "Was the Example City water portal outage a hack?", "The Example City water portal outage"), /must end with a question mark/);
rule("a main question too long to be a page title", (t) => t.swap("questions.csv", "Was the Example City water portal outage a hack?", "Was the Example City water billing portal outage on January 12 caused by a hack?"), /keep it to 70 characters/);
rule("an answered question with no answer", (t) => t.swap("questions.csv", "\"No. The utility said no systems were encrypted, and the claim came from one anonymous post.\"", ""), /answer_text: required once state is answered/);
rule("an open question that does not say what would settle it", (t) => t.swap("questions.csv", "A statement from the utility or its regulator on whether any data was accessed.", ""), /what_would_settle_it: required while open/);
rule("more than three other names", (t) => t.head((h) => { h.also_called = ["the first name", "the second name", "the third name", "the fourth name"]; }), /also_called: has 4 items, maximum 3/);

// ---------- the verdict belongs to the owner ----------
rule("a verdict with no approval time", (t) => t.head((h) => { h.verdict = "Confirmed not a hack"; h.status = "closed"; }), /verdict_approved_at: required when a verdict is set/);
rule("a verdict on an incident that is not closed", (t) => t.head((h) => { h.verdict = "Confirmed not a hack"; h.verdict_approved_at = "2026-01-20T09:00:00-05:00"; }), /status: must be closed once a verdict is set/);
rule("a closed incident with no verdict", (t) => t.head((h) => { h.status = "closed"; }), /a closed incident needs an approved verdict/);
rule("a likely verdict named in a claim", (t) => t.swap("claims.csv", "No outside party has reviewed it.", "Confirmed not a hack candidate."), /uses the words of a final verdict/);
rule("a likely verdict named in the head", (t) => t.head((h) => { h.not_known[0].text = "Whether this ends as a confirmed hack."; }), /uses the words of a final verdict/);
rule("a likely verdict named in a note", (t) => t.swap("notes/background.md", "\n", "\nLikely confirmed not a hack.\n"), /notes\/background\.md line \d+: uses the words of a final verdict/);

// ---------- the plain answer on the home page may not say more than the main answer ----------
rule("an incident with no answer group", (t) => t.head((h) => { delete h.answer_group; }), /answer_group: missing \(required\)/);
rule("an incident with no incident type", (t) => t.head((h) => { delete h.incident_type; }), /incident_type: missing \(required\)/);
rule("an incident type outside the three", (t) => t.head((h) => { h.incident_type = "ransomware"; }), /incident\.json\.incident_type: "ransomware" is not one of/);
rule("a main answer labelled with a claim-only label", (t) => t.swap("questions.csv", ",Reported,c004;c001", ",Debunked,c004;c001"), /label: the main question is labelled Debunked; a main answer is Confirmed, Reported or Not established/);
rule("filed as a stated hack while the main answer is not Confirmed", (t) => t.head((h) => { h.answer_group = "hack-stated"; }), /answer_group: "hack-stated" needs the main question to be labelled Confirmed; it is labelled Reported/);
rule("filed as a reported hack while the main answer is not Reported", (t) => { t.swap("questions.csv", ",Reported,c004;c001", ",Not established,c004;c001"); t.head((h) => { h.answer_group = "hack-reported"; }); }, /answer_group: "hack-reported" needs the main question to be labelled Reported; it is labelled Not established/);
rule("filed as unclear while the main answer is Confirmed", (t) => { t.swap("questions.csv", ",Reported,c004;c001", ",Confirmed,c004;c001"); t.head((h) => { h.answer_group = "unclear"; }); }, /answer_group: "unclear" needs the main question to be labelled Not established; it is labelled Confirmed/);
rule("filed as no sign of a hack while the main answer is Not established", (t) => t.swap("questions.csv", ",Reported,c004;c001", ",Not established,c004;c001"), /answer_group: "no-sign-of-hack" needs the main question to be labelled Confirmed or Reported; it is labelled Not established/);
rule("a service state resting on a claim that does not exist", (t) => t.head((h) => { h.service.claim_id = "c099"; }), /service\.claim_id: "c099" is not in claims\.csv/);
rule("a service state resting on a rumor", (t) => t.head((h) => { h.service.claim_id = "c003"; }), /service: rests on c003, which is labelled Rumor; whether a service is back can only rest on a Confirmed or Reported claim/);
rule("a service state outside the three", (t) => t.head((h) => { h.service.state = "fine"; }), /incident\.json\.service\.state: "fine" is not one of/);

// ---------- resolved means over and quiet ----------
// The sample's last update is u003 at 5:30 PM on Jan 12, with one check the next morning.
const LOG_HEAD = "claim_ids,author\n";
const quietRow = (id, at, type = "checked_no_change") => `${id},${at},watch,${type},Still nothing new from the utility.,"Checked the status page and the utility newsroom. No change.",,Research agent\n`;
const resolved = (rows = "", more = () => {}) => (t) => { if (rows) t.swap("update_log.csv", LOG_HEAD, LOG_HEAD + rows); t.head((h) => { h.status = "resolved"; more(h); }); };
const QUIET_WEEK = quietRow("u006", "2026-01-19T17:30:00-05:00") + quietRow("u005", "2026-01-16T08:00:00-05:00");
test("a story with nothing down and seven quiet days across two checks may be resolved", () => {
  assert.deepEqual(problems(resolved(QUIET_WEEK)), [], "exactly seven days after the last update, with three checks since");
  assert.deepEqual(problems(resolved(QUIET_WEEK, (h) => { delete h.service; })), [], "and a story where nothing ever went down");
  assert.deepEqual(problems(resolved(quietRow("u006", "2026-01-19T17:30:00-05:00", "staleness_check") + quietRow("u005", "2026-01-16T08:00:00-05:00", "blocked_source"))), [], "any logged check counts, whatever kind it is");
});
rule("resolved while something is still down", resolved(QUIET_WEEK, (h) => { h.service.state = "partly-back"; }), /status: resolved, but service says "partly-back"; a story is resolved only when nothing is still down\. Set status back to monitoring/);
rule("resolved the day after its last update", resolved(), /status: resolved, but update_log\.csv u003 filed an update \(updated\) only 14 hours before the newest check; a story is resolved after seven days with no update\. Set status back to monitoring/);
rule("resolved a minute short of seven quiet days", resolved(quietRow("u006", "2026-01-19T17:29:00-05:00") + quietRow("u005", "2026-01-16T08:00:00-05:00")), /u003 filed an update \(updated\) only 6 days before the newest check/);
rule("resolved after seven quiet days but only one check", (t) => { t.swap("update_log.csv", "u004,2026-01-13T08:00:00-05:00", "u004,2026-01-20T08:00:00-05:00"); t.head((h) => { h.status = "resolved"; }); }, /status: resolved, but only one check follows the last update \(update_log\.csv u003\); a story is resolved after at least two checks across seven quiet days/);
rule("a change to wording is not a check", (t) => { t.swap("update_log.csv", "u004,2026-01-13T08:00:00-05:00,watch,checked_no_change", "u004,2026-01-13T08:00:00-05:00,watch,presentation"); resolved(quietRow("u005", "2026-01-20T08:00:00-05:00"))(t); }, /only one check follows the last update \(update_log\.csv u003\)/);
rule("a new update on a resolved story must put it back in monitoring", resolved(`u007,2026-01-22T09:00:00-05:00,watch,updated,The utility publishes its review of the failed update.,Added the review.,c001,Research agent\n` + QUIET_WEEK), /update_log\.csv u007 filed an update \(updated\) and no check has followed it; a story is resolved after seven days with no update\. Set status back to monitoring/);
rule("a correction on a resolved story counts as an update too", resolved(`u008,2026-01-23T09:00:00-05:00,watch,checked_no_change,Still nothing new.,No change.,,Research agent\nu007,2026-01-22T09:00:00-05:00,watch,correction,The restore time was wrong by an hour.,Corrected the restore time.,c006,Research agent\n` + QUIET_WEEK), /update_log\.csv u007 filed an update \(correction\) only 1 day before the newest check/);
test("a monitoring story is not held to the resolved rule", () => {
  assert.deepEqual(problems((t) => t.head((h) => { h.service.state = "down"; })), [], "a story still down and updated an hour ago is fine while it is monitoring");
});

rule("an answer group that contradicts the verdict", (t) => t.head((h) => { h.verdict = "Confirmed hack"; h.verdict_approved_at = "2026-01-20T09:00:00-05:00"; h.status = "closed"; }), /answer_group: must be "hack-stated" once the verdict is "Confirmed hack"/);

// ---------- update log ----------
rule("an update log that is not newest first", (t) => t.swap("update_log.csv", "u003,2026-01-12T17:30:00-05:00", "u003,2026-01-14T17:30:00-05:00"), /update_log\.csv: rows must be newest first/);
rule("a role outside the list as author", (t) => t.swap("update_log.csv", ",Research agent\n", ",Intern\n"), /author: "Intern" is not one of/);

// ---------- privacy ----------
rule("a social handle in text", (t) => t.swap("claims.csv", "No outside party has reviewed it.", "First posted by @somebody."), /contains a handle or email address/);
rule("an email address in text", (t) => t.head((h) => { h.who_is_affected = "Customers; write to press@example.org."; }), /contains a handle or email address/);
rule("a phone number in text", (t) => t.swap("claims.csv", "No outside party has reviewed it.", "Customers were told to call 555-867-5309."), /looks like a phone number/);
rule("a forum username in text", (t) => t.swap("claims.csv", "No outside party has reviewed it.", "Posted by u/some_person."), /contains a forum username/);
rule("a handle in a note", (t) => t.swap("notes/background.md", "\n", "\nSeen first from @somebody.\n"), /notes\/background\.md line \d+: contains a handle/);

// ---------- charts and images ----------
rule("a chart column that is not a number", (t) => {
  const file = "charts/problem-reports.csv";
  const lines = readFileSync(join(t.dir, file), "utf8").split("\n");
  const cells = lines[1].split(",");
  cells[cells.length - 1] = "many";
  lines[1] = cells.join(",");
  writeFileSync(join(t.dir, file), lines.join("\n"));
}, /problem-reports\.csv row 1, .*: "many" is not a number/);
rule("an image that no longer matches its checksum", (t) => t.swap("images/outage-window.svg", "<svg", "<svg data-edited=\"1\""), /sha256: does not match the file/);
rule("a licensed image that does not say where it came from", (t) => t.head((h) => { h.images.find((x) => x.id === "water-tower").rights = "licensed"; }), /say where the image came from with source_id or source_url/);
rule("an image file that is missing", (t) => t.head((h) => { h.images[0].file = "images/gone.svg"; }), /images\[0\]\.file: "images\/gone\.svg" is missing/);

// ---------- the incident's picture ----------
rule("an incident with no subject", (t) => t.head((h) => { delete h.subject; }), /incident\.json\.subject: missing \(required\)/);
rule("a subject kind outside the list", (t) => t.head((h) => { h.subject.kind = "big-tech"; }), /subject\.kind: "big-tech" is not one of/);
rule("a lead image that is not defined", (t) => t.head((h) => { h.lead_image = "missing-photo"; }), /lead_image: no image with id "missing-photo"/);
rule("an SVG used as the lead image", (t) => t.head((h) => { h.lead_image = "outage-window"; }), /lead_image: must be a png, jpg or webp/);
rule("a lead image that is too small", (t) => t.head((h) => { h.images.find((x) => x.id === "water-tower").width = 800; }), /lead_image: the image is 800 pixels wide/);
rule("a lead image that is not landscape", (t) => t.head((h) => { const x = h.images.find((i) => i.id === "water-tower"); x.width = 1200; x.height = 1600; }), /lead_image: the image must be landscape/);

// These two do not depend on which pictures the live incidents happen to use.
test("an incident without a photograph gets the drawn picture", () => {
  const head = JSON.parse(readFileSync(join(SAMPLE, "incident.json"), "utf8"));
  delete head.lead_image;
  const picture = incidentPicture(head, "data");
  assert.match(picture.html, /^<svg class="plate"[^>]*aria-label="Example City Water"/);
  assert.match(picture.html, /<text class="plate-name"[^>]*>Example City Water<\/text>/);
  assert.equal(picture.credit, "");
  assert.equal(picture.image, null);
});
test("the drawn picture names the subject and its kind, and an unknown kind still draws", () => {
  const plate = renderPlate({ name: "FAA", kind: "aviation" });
  assert.match(plate, /aria-label="FAA: aviation"/);
  assert.match(plate, /<text class="plate-kind"[^>]*>Aviation<\/text>/);
  assert.match(renderPlate({ name: "A & B <Co>", kind: "not-a-kind" }), /<text class="plate-name"[^>]*>A &amp; B &lt;Co&gt;<\/text>/);
});

// ---------- the build ----------
test("the build is repeatable and writes the pages search engines need", () => {
  const base = mkdtempSync(join(tmpdir(), "isitahack-build-"));
  try {
    const build = (name) => { execFileSync(process.execPath, [join(ROOT, "scripts", "build.mjs"), "--out", join(base, name), "--sample"], { stdio: "pipe" }); return join(base, name); };
    const a = build("a"), b = build("b");
    const files = ["index.html", "status.html", "404.html", "sitemap.xml", "robots.txt", "index.json", `incidents/${SLUG}.html`, `incidents/${SLUG}.md`];
    for (const f of files) assert.equal(readFileSync(join(a, f), "utf8"), readFileSync(join(b, f), "utf8"), `${f} differs between two builds`);
    const page = readFileSync(join(a, "incidents", `${SLUG}.html`), "utf8");
    assert.match(page, /<title>Was the Example City water portal outage a hack\? \| Is It a Hack\?<\/title>/);
    assert.match(page, /<h1 id="the-question">Was the Example City water portal outage a hack\?<\/h1>/);
    assert.equal(page.match(/<h1[ >]/g).length, 1, "an incident page has exactly one main heading");
    assert.match(page, new RegExp(`<link rel="canonical" href="https://isitahack\\.com/incidents/${SLUG}\\.html">`));
    const data = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const article = data.find((d) => d["@type"] === "Article");
    assert.equal(article.headline, "Was the Example City water portal outage a hack?");
    assert.equal(article.datePublished, "2026-01-12T09:10:00-05:00");
    assert.equal(article.dateModified, "2026-01-12T17:30:00-05:00", "a check that changed nothing does not move the modified date");
    assert.match(readFileSync(join(a, "sitemap.xml"), "utf8"), new RegExp(`<loc>https://isitahack\\.com/incidents/${SLUG}\\.html</loc><lastmod>2026-01-12T17:30:00-05:00</lastmod>`));
    assert.ok(readdirSync(a).includes("404.html"));
    // pictures: a photograph where the incident has one, the drawn plate where it does not
    assert.match(page, /<figure class="head-media"><img src="\.\.\/data\/incidents\/[^"]+\/images\/water-tower\.png"[^>]*><figcaption>Image: isitahack\.com<\/figcaption>/);
    assert.match(page, /<meta property="og:image" content="https:\/\/isitahack\.com\/data\/incidents\/[^"]+\/images\/water-tower\.png">/);
    // the page reads at three depths, and every depth is in the page itself, so it is all
    // there without the script: the short answer, the full story, the evidence
    assert.match(page, /<div class="answer-head"><p class="kicker">Is it a hack\? The short answer<\/p><span class="pill pill-no-sign answer-pill">No sign of a hack<\/span><\/div>/, "the plain answer leads the answer box");
    assert.match(page, /<span class="field">How well supported<\/span> <span class="pill pill-reported"/, "the evidence label follows it");
    const depthAt = (cls) => page.indexOf(`<section class="depth ${cls}"`);
    assert.ok(depthAt("depth-short") > 0 && depthAt("depth-short") < depthAt("depth-story") && depthAt("depth-story") < depthAt("depth-evidence"), "the three depths come in order");
    const storyPart = page.slice(depthAt("depth-story"), depthAt("depth-evidence")), evidencePart = page.slice(depthAt("depth-evidence"));
    assert.match(page.slice(depthAt("depth-short"), depthAt("depth-story")), /<h2>Known so far<\/h2>[\s\S]*<h2>Not known yet<\/h2>/, "the short answer says what is and is not known");
    assert.match(storyPart, /<details class="row" id="c001"/, "claims are part of the full story");
    assert.match(evidencePart, /id="sources"[\s\S]*id="update-log"[\s\S]*id="raw-files"/, "sources, the update log and the raw files are the evidence");
    assert.equal(page.match(/<button type="button" data-depth="(short|story|evidence)" aria-pressed="false">/g).length, 3, "the switch offers the three depths");
    assert.doesNotMatch(page, /<html[^>]*data-depth/, "nothing is hidden until the script says how deep to read");
    const home = readFileSync(join(a, "index.html"), "utf8");
    // the home page lists every incident once, as a row under its plain answer
    const listed = JSON.parse(readFileSync(join(a, "index.json"), "utf8")).incidents;
    const rows = home.match(/<li class="irow"/g).length;
    assert.equal(rows, listed.length, "the home page has one row for every incident");
    const counts = [...home.matchAll(/<span class="group-n" data-count>(\d+)<\/span>/g)].map((m) => Number(m[1]));
    assert.equal(counts.length, 4, "the home page has the four answer groups");
    assert.equal(counts.reduce((sum, n) => sum + n, 0), rows, "the group counts add up to the rows");
    const group = (id) => home.slice(home.indexOf(`<section class="group" id="${id}"`)).split("</section>")[0];
    const sampleRow = new RegExp(`<li class="irow" data-type="outage"[^>]*><a href="incidents/${SLUG}\\.html">`);
    assert.match(group("no-sign-of-hack"), sampleRow, "the sample is filed under its answer group, with its kind");
    assert.doesNotMatch(group("unclear") + group("hack-stated") + group("hack-reported"), sampleRow, "and under no other group");
    assert.equal(listed.find((i) => i.slug === SLUG).answer_group, "no-sign-of-hack", "index.json says which answer an incident is filed under");
    // index.json is built from the last index.json, so its key order must not depend on how many times the build has run
    for (const entry of listed) assert.equal(Object.keys(entry).at(-1), "files", `index.json entry ${entry.slug}: files comes last, whatever the previous build wrote`);
    // the front of the home page: this week's stories by size, with the newest changes beside them
    const frontPart = home.slice(home.indexOf('<div class="wrap now"'), home.indexOf('<section class="wrap board"'));
    assert.ok(frontPart.length > 0 && home.indexOf('<div class="wrap now"') < home.indexOf('<section class="wrap board"'), "the front comes before the full list");
    assert.doesNotMatch(home.replace(frontPart, ""), /<img /, "outside the front, the home page lists incidents as text");
    for (const img of frontPart.match(/<img [^>]*>/g) || []) {
      assert.match(img, / alt="[^"]+"/, `a picture on the front says what it shows: ${img}`);
      assert.match(img, / width="\d+" height="\d+"/, `and reserves its space: ${img}`);
      assert.match(img, / loading="lazy"/, `and loads only when it is reached: ${img}`);
    }
    for (const t of frontPart.match(/<time [^>]*>/g) || []) assert.match(t, /^<time class="ago[^"]*" datetime="\d{4}-\d{2}-\d{2}T[^"]+">$/, `a time on the front carries its full timestamp: ${t}`);
    assert.doesNotMatch(frontPart, new RegExp(`incidents/${SLUG}\\.html`), "the made-up sample happened long ago, so it is in the full list but not on the front");
    // the status board counts the same incidents: one row each, and tiles that add up
    const board = readFileSync(join(a, "status.html"), "utf8");
    assert.equal(board.match(/<tr data-group="/g).length, listed.length, "the status board has one row for every incident");
    const tiles = [...board.matchAll(/<span class="stat-n">(\d+)<\/span>/g)].map((m) => Number(m[1]));
    assert.equal(tiles.length, 4, "the status board has a count for each of the four answers");
    assert.equal(tiles.reduce((sum, n) => sum + n, 0), listed.length, "the counts add up to the incidents");
    assert.match(board, new RegExp(`<tr data-group="no-sign-of-hack"[^>]*><td data-label="Incident"><a href="incidents/${SLUG}\\.html">`), "the sample is on the board under its answer");
    assert.match(readFileSync(join(a, "sitemap.xml"), "utf8"), /<loc>https:\/\/isitahack\.com\/status\.html<\/loc>/, "the status board is in the sitemap");
    // whether a service is back is said with the claim it rests on, on the page and on the board
    assert.match(page, /<h2 class="kicker">Is it back\?<\/h2><p><strong>Back\.<\/strong> Billing portal restored\. <a class="ref" href="#t\d+">evidence<\/a>/, "the short answer says whether the service is back, with its evidence");
    assert.match(board, new RegExp(`<li class="svc svc-back"[^>]*><span class="svc-state">.*?Back</span><a class="svc-name" href="incidents/${SLUG}\\.html">`), "the board lists the sample as back");
    assert.equal(board.match(/<li class="svc svc-/g).length, listed.filter((i) => i.service).length, "the board lists exactly the incidents whose data says how things stand");
    // when the next check is due: on the board, in index.json for the agents, on the page and in its Markdown
    const sample = listed.find((i) => i.slug === SLUG);
    assert.deepEqual([sample.last_checked, sample.check_every, sample.next_check_due], ["2026-01-13T08:00:00-05:00", "day", "2026-01-14T23:59:00-05:00"], "index.json says when the sample was last checked and when it is next due");
    assert.match(board, new RegExp(`<tr data-group="no-sign-of-hack"[^>]*data-due="2026-01-14T23:59:00-05:00"><td data-label="Incident"><a href="incidents/${SLUG}\\.html">`), "the board carries each incident's due time for the browser to judge");
    assert.match(board, /<td data-label="Next check"><span class="due"><time datetime="2026-01-14T23:59:00-05:00">Jan 14, 2026<\/time><\/span><span class="kind"[^>]*>Daily<\/span><\/td>/, "and shows the day the next check is due");
    assert.equal(board.match(/ data-due="/g).length, listed.filter((i) => i.next_check_due).length, "every incident that is still checked has a due time on the board");
    assert.match(page, /The next check is due by <time datetime="2026-01-14T23:59:00-05:00">the end of Jan 14, 2026<\/time>: the desk checks once a day for the first three days\./, "the page says when the next check is due and why");
    assert.match(readFileSync(join(a, "incidents", `${SLUG}.md`), "utf8"), /^last_checked: 2026-01-13T08:00:00-05:00\nnext_check_due: 2026-01-14T23:59:00-05:00$/m, "and so does the Markdown version");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------- built pages stay out of the repository ----------
test("the check knows a built page from a source", () => {
  const hasData = (slug) => slug === SLUG;
  for (const f of ["index.html", "status.html", "about.html", "how-it-works.html", "404.html", "sitemap.xml", "index.json", "_site/index.html", `incidents/${SLUG}.html`, `incidents/${SLUG}.md`, "incidents/2026-02-anything.html"])
    assert.equal(isBuiltPage(f, hasData), true, `${f} is written by the build and must not be committed`);
  for (const f of ["pages/home.html", "pages/status.html", "llms.txt", "robots.txt", `data/incidents/${SLUG}/incident.json`, "format/README.md", "scripts/partials/head.html", "incidents/2026-02-not-yet-converted.md"])
    assert.equal(isBuiltPage(f, hasData), false, `${f} is a source and belongs in the repository`);
});

// ---------- when the next check is due ----------
test("the next check follows the decided cadence", () => {
  const first_published = "2026-11-20T09:00:00-05:00";
  const due = (o) => nextCheck({ status: "monitoring", service: null, first_published, ...o });
  assert.deepEqual(due({ last_checked: "2026-11-20T22:10:00-05:00", service: { state: "down" } }), { every: "hour", due: "2026-11-20T23:10:00-05:00" }, "every hour while it is down, in the story's first three days");
  assert.deepEqual(due({ last_checked: "2026-11-20T23:30:00-05:00", service: { state: "partly-back" } }), { every: "hour", due: "2026-11-21T00:30:00-05:00" }, "and while it is only partly back, across midnight");
  assert.deepEqual(due({ last_checked: "2026-11-22T23:30:00-05:00", service: { state: "down" } }), { every: "hour", due: "2026-11-23T00:30:00-05:00" }, "still hourly on the story's third day");
  assert.deepEqual(due({ last_checked: "2026-11-23T00:20:00-05:00", service: { state: "down" } }), { every: "day", due: "2026-11-24T23:59:00-05:00", down: true }, "after three days something still down is checked once a day, not hourly");
  assert.deepEqual(due({ last_checked: "2026-12-10T15:00:00-05:00", service: { state: "partly-back" } }), { every: "day", due: "2026-12-11T23:59:00-05:00", down: true }, "and stays daily for as long as it is only partly back");
  assert.deepEqual(due({ last_checked: "2026-12-10T15:00:00-05:00", service: { state: "down" }, status: "resolved" }), { every: "day", due: "2026-12-11T23:59:00-05:00", down: true }, "something still down is checked daily whatever the status says");
  assert.equal(cadenceText(due({ last_checked: "2026-12-10T15:00:00-05:00", service: { state: "down" } })), "once a day while it is still down", "the page says why a late outage is checked daily");
  assert.equal(cadenceText(due({ last_checked: "2026-11-21T10:00:00-05:00" })), "once a day for the first three days", "and an early story's daily check keeps its own words");
  assert.deepEqual(due({ last_checked: "2026-11-20T09:00:00-05:00", service: { state: "back" } }), { every: "day", due: "2026-11-21T23:59:00-05:00" }, "once it is back, the story's own cadence applies");
  assert.deepEqual(due({ last_checked: "2026-11-22T23:50:00-05:00" }), { every: "day", due: "2026-11-23T23:59:00-05:00" }, "once a day for the first three days, due by the end of the next day");
  assert.deepEqual(due({ last_checked: "2026-11-23T00:05:00-05:00" }), { every: "3 days", due: "2026-11-26T23:59:00-05:00" }, "every three days after that");
  assert.deepEqual(due({ last_checked: "2026-11-29T10:00:00-05:00" }), { every: "3 days", due: "2026-12-02T23:59:00-05:00" }, "across the end of a month");
  assert.deepEqual(due({ last_checked: "2026-11-21T10:00:00-05:00", status: "resolved" }), { every: "week", due: "2026-11-28T23:59:00-05:00" }, "weekly once it is resolved");
  assert.deepEqual(due({ last_checked: "2026-11-21T03:30:00Z" }), { every: "day", due: "2026-11-22T23:59:00Z" }, "the day is counted in the offset the check was logged with");
  assert.equal(due({ last_checked: "2026-11-21T10:00:00-05:00", status: "closed" }), null, "a closed story is not checked again");
  assert.equal(due({ last_checked: "" }), null, "no check, no due time");
});

// ---------- an update has to change something ----------
test("a new log row filed as an update must name a claim the change added or altered", () => {
  const read = (file) => readFileSync(join(SAMPLE, file), "utf8");
  const before = { claims: read("claims.csv"), questions: read("questions.csv"), update_log: read("update_log.csv") };
  // adds a log row above the newest one, and optionally edits the other files
  const after = (row, edit = {}) => ({
    claims: (edit.claims || ((x) => x))(before.claims),
    questions: (edit.questions || ((x) => x))(before.questions),
    update_log: before.update_log.replace("\nu004,", `\n${row}\nu004,`),
  });
  const row = (type, ids, id = "u005") => `${id},2026-01-14T08:00:00-05:00,watch,${type},Two more outlets report the outage.,Both repeat the utility's statement.,${ids},Research agent`;
  const swap = (from, to) => (text) => { assert.ok(text.includes(from), `the sample still has ${from}`); return text.replace(from, to); };
  const c006 = before.claims.split("\n").find((l) => l.startsWith("c006,"));

  assert.deepEqual(emptyUpdates(before, before), [], "rows already on main are never judged, whatever they name");
  assert.match(emptyUpdates(before, after(row("updated", "")))[0], /^update_log\.csv u005: filed as updated but names no claim\..*checked_no_change$/, "an update that names no claim is refused");
  assert.match(emptyUpdates(before, after(row("updated", "c006")))[0], /^update_log\.csv u005: filed as updated, but c006 is the same as on main apart from the check date/, "an update that names an untouched claim is refused");
  assert.match(emptyUpdates(before, after(row("added", "c005;c006")))[0], /u005: filed as added, but c005, c006 are the same as on main/, "so is one filed as added");
  const rechecked = swap(c006, c006.replace(/[^,]*$/, "2026-01-14T08:00:00-05:00"));
  assert.match(emptyUpdates(before, after(row("updated", "c006"), { claims: rechecked }))[0], /c006 is the same as on main apart from the check date/, "re-checking a claim moves its date, and that alone is not an update");
  assert.deepEqual(emptyUpdates(before, after(row("checked_no_change", ""), { claims: rechecked })), [], "the same run filed as checked_no_change passes");
  assert.deepEqual(emptyUpdates(before, after(row("presentation", ""))), [], "a wording-only row needs no claim");
  assert.deepEqual(emptyUpdates(before, after(row("updated", "c006"), { claims: swap(c006, c006.replace(",Confirmed,", ",Reported,")) })), [], "a claim whose label changed is a change");
  assert.deepEqual(emptyUpdates(before, after(row("added", "c099"), { claims: (text) => `${text}${c006.replace("c006,", "c099,")}\n` })), [], "a new claim is a change");
  assert.deepEqual(emptyUpdates(before, after(row("label_change", "c001"), { questions: swap(",Reported,", ",Confirmed,") })), [], "a question with a new label is a change to the claims it rests on");
  assert.deepEqual(emptyUpdates({ claims: "", questions: "", update_log: "" }, before), [], "a new story is all change");
});
