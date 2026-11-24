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
import { incidentPicture } from "../incident.mjs";
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
rule("filed as a stated hack while the main answer is not Confirmed", (t) => t.head((h) => { h.answer_group = "hack-stated"; }), /answer_group: "hack-stated" needs the main question to be labelled Confirmed; it is labelled Unverified/);
rule("filed as a reported hack while the main answer is not Reported", (t) => t.head((h) => { h.answer_group = "hack-reported"; }), /answer_group: "hack-reported" needs the main question to be labelled Reported/);
rule("filed as unclear while the main answer is Confirmed", (t) => { t.swap("questions.csv", ",Unverified,", ",Confirmed,"); t.head((h) => { h.answer_group = "unclear"; }); }, /answer_group: "unclear" does not fit a main question labelled Confirmed/);
rule("filed as no sign of a hack while the main answer is Not established", (t) => t.swap("questions.csv", ",Unverified,", ",Not established,"), /answer_group: "no-sign-of-hack" does not fit a main question labelled Not established/);
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
    const files = ["index.html", "404.html", "sitemap.xml", "robots.txt", "index.json", `incidents/${SLUG}.html`, `incidents/${SLUG}.md`];
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
    assert.match(page, /<span class="field">How well supported<\/span> <span class="pill pill-unverified"/, "the evidence label follows it");
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
    assert.doesNotMatch(home, /<img /, "the home page lists incidents as text; photographs stay on the incident pages");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
