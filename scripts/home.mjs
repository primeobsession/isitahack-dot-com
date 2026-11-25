// The front of the home page: this week's stories from biggest to smallest, with the newest
// changes beside them. Everything here is worked out from the incidents' own data. The one
// thing added by hand is data/front-page.json, the Editor-in-Chief's picks (format/README.md):
// which stories lead a band, which older ones stay on, which are held back, and an optional
// line for a story.
//
// The build has no clock, so "now" is the newest check logged in any incident (asOf). The page
// prints real timestamps and a few lines of script turn them into "6 min ago" for the reader.

import { ANSWER_GROUPS, sizeBars, esc, fmtDate } from "./html.mjs";
export { sizeBars };
import { incidentPicture } from "./incident.mjs";

const HOUR = 36e5, DAY = 864e5;
// A story is on the front while it is new, recent or still down.
export const FRESH_DAYS = 7;      // the incident happened within this many days
export const OPENED_HOURS = 48;   // or the story was opened this recently
export const NEW_HOURS = 24;      // "New story" is shown this long
export const PICKS_HOURS = 48;    // lead picks and lines lapse this long after `updated`
export const LIVE_HOURS = 36;     // live updates reach back this far
const LIVE_MIN = 6, LIVE_MAX = 14;
const PICK_LIMITS = { lead: 8, keep: 12, hold: 12, lines: 8, text: 160, untilDays: 14 };

// How many stories a band shows as large tiles, as small tiles and as rows.
export const BANDS = [
  { key: "nation", title: "Nation-level", sizes: ["Nation-level", "Nation-level potential"], bars: 4, big: 2, side: 2, rows: 4, gloss: "National infrastructure or services, or a matter for national government." },
  { key: "large", title: "Large", sizes: ["Large"], bars: 3, big: 0, side: 4, rows: 4, gloss: "Many people or a major organization across the country, or a service people rely on daily." },
  { key: "regional", title: "Regional", sizes: ["Regional"], bars: 2, big: 0, side: 0, rows: 6, gloss: "Several organizations, or a multi-city or multi-state area." },
  { key: "local", title: "Local", sizes: ["Local"], bars: 1, big: 0, side: 0, rows: 4, gloss: "One organization, town or facility and the people who use it directly." },
];
const POTENTIAL = "Nation-level potential";
const KINDS = { added: "Update", updated: "Update", label_change: "Label changed", correction: "Correction" };

const ms = (iso) => Date.parse(iso);
const dayOf = (iso) => String(iso).slice(0, 10);
const daysApart = (fromDay, toDay) => Math.round((Date.parse(toDay) - Date.parse(fromDay)) / DAY);
const isDown = (i) => Boolean(i.service) && (i.service.state === "down" || i.service.state === "partly-back");

// The newest check in any incident: the build's "now".
export function asOfOf(incidents) {
  let best = null;
  for (const i of incidents) for (const at of [i.last_checked, i.last_updated]) if (at && (!best || ms(at) > ms(best))) best = at;
  return best;
}

// ---------- data/front-page.json ----------
export const NO_PICKS = { updated: null, lead: [], keep: [], hold: [], lines: [] };
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const VERDICT_WORDS = /confirmed\s+(not\s+a\s+)?hack/i;

// Reads the picks and says what is wrong with them. `slugs` is the set of incidents that exist.
export function checkFrontPage(raw, slugs) {
  const errs = [], bad = (m) => errs.push(`data/front-page.json: ${m}`);
  let doc;
  try { doc = JSON.parse(raw); } catch (x) { return { errs: [`data/front-page.json: not valid JSON (${x.message})`], picks: NO_PICKS }; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { errs: ["data/front-page.json: must be one JSON object"], picks: NO_PICKS };
  for (const k of Object.keys(doc)) if (!(k in NO_PICKS)) bad(`"${k}" is not a field. The fields are updated, lead, keep, hold and lines`);
  const list = (k) => { if (doc[k] === undefined) return []; if (!Array.isArray(doc[k])) { bad(`${k} must be a list`); return []; } return doc[k]; };
  const known = (slug, where) => { if (typeof slug !== "string" || !slugs.has(slug)) { bad(`${where}: "${slug}" is not an incident on the site`); return false; } return true; };
  if (typeof doc.updated !== "string" || !STAMP.test(doc.updated) || Number.isNaN(ms(doc.updated))) bad(`updated must be a full timestamp with its offset, like 2026-11-25T14:40:00-05:00`);
  const until = (v, where) => {
    if (typeof v !== "string" || !DAY_RE.test(v) || Number.isNaN(Date.parse(v))) { bad(`${where}: until must be a day, like 2026-12-02`); return false; }
    if (typeof doc.updated === "string" && STAMP.test(doc.updated) && daysApart(dayOf(doc.updated), v) > PICK_LIMITS.untilDays) { bad(`${where}: until is more than ${PICK_LIMITS.untilDays} days after updated. Set a nearer day and renew it if it is still needed`); return false; }
    return true;
  };
  const once = (seen, slug, where) => { if (seen.has(slug)) { bad(`${where}: "${slug}" is listed twice`); return false; } seen.add(slug); return true; };

  const lead = [], leadSeen = new Set();
  for (const slug of list("lead")) if (known(slug, "lead") && once(leadSeen, slug, "lead")) lead.push(slug);
  if (lead.length > PICK_LIMITS.lead) bad(`lead has ${lead.length} stories; at most ${PICK_LIMITS.lead}. The page orders the rest itself`);

  const dated = (k, needReason) => {
    const out = [], seen = new Set();
    for (const row of list(k)) {
      if (!row || typeof row !== "object") { bad(`${k}: each entry is an object with slug and until`); continue; }
      const where = `${k} ${row.slug}`;
      if (!known(row.slug, k) || !once(seen, row.slug, k) || !until(row.until, where)) continue;
      if (needReason && (typeof row.reason !== "string" || !row.reason.trim())) { bad(`${where}: say why in reason`); continue; }
      out.push({ slug: row.slug, until: row.until, ...(needReason ? { reason: row.reason } : {}) });
    }
    if (out.length > PICK_LIMITS[k]) bad(`${k} has ${out.length} stories; at most ${PICK_LIMITS[k]}`);
    return out;
  };
  const keep = dated("keep", false), hold = dated("hold", true);
  const held = new Set(hold.map((h) => h.slug));
  for (const slug of [...lead, ...keep.map((k) => k.slug)]) if (held.has(slug)) bad(`"${slug}" is held back and also picked. Choose one`);

  const lines = [], lineSeen = new Set();
  for (const row of list("lines")) {
    if (!row || typeof row !== "object") { bad("lines: each entry is an object with slug and text"); continue; }
    if (!known(row.slug, "lines") || !once(lineSeen, row.slug, "lines")) continue;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) { bad(`lines ${row.slug}: text is empty`); continue; }
    if (text.length > PICK_LIMITS.text) { bad(`lines ${row.slug}: text is ${text.length} characters; at most ${PICK_LIMITS.text}`); continue; }
    if (VERDICT_WORDS.test(text)) { bad(`lines ${row.slug}: the verdict words belong to the final verdict, which only the site's owner sets`); continue; }
    lines.push({ slug: row.slug, text });
  }
  if (lines.length > PICK_LIMITS.lines) bad(`lines has ${lines.length} entries; at most ${PICK_LIMITS.lines}`);
  return { errs, picks: { updated: typeof doc.updated === "string" ? doc.updated : null, lead, keep, hold, lines } };
}

// The picks in force at `asOf`. Lead picks and lines lapse two days after the file was last
// updated, so a front page nobody is tending falls back to the rules. Keeps and holds run to
// their own day.
export function activePicks(picks, asOf) {
  const tended = Boolean(picks.updated) && ms(asOf) - ms(picks.updated) <= PICKS_HOURS * HOUR;
  const today = dayOf(asOf);
  const running = (rows) => new Set(rows.filter((r) => r.until >= today).map((r) => r.slug));
  return {
    lead: tended ? picks.lead : [],
    lines: new Map(tended ? picks.lines.map((l) => [l.slug, l.text]) : []),
    keep: running(picks.keep), hold: running(picks.hold),
  };
}

// ---------- which stories are on the front ----------
export function isFresh(i, asOf, on) {
  if (!i.typed || !i.size || on.hold.has(i.slug)) return false;
  if (on.keep.has(i.slug) || on.lead.includes(i.slug)) return true;
  if (i.status !== "monitoring") return false;
  return isDown(i) || daysApart(i.incident_date, dayOf(asOf)) <= FRESH_DAYS || ms(asOf) - ms(i.first_published) <= OPENED_HOURS * HOUR;
}

// The bands, each with its stories in order: the editor's lead picks, then established size
// before potential, then the most recently updated.
export function frontBands(incidents, picks = NO_PICKS) {
  const asOf = asOfOf(incidents);
  if (!asOf) return { asOf: null, on: activePicks(NO_PICKS, "1970-01-01T00:00:00+00:00"), bands: [] };
  const on = activePicks(picks, asOf);
  const rank = (i) => { const n = on.lead.indexOf(i.slug); return n < 0 ? Infinity : n; };
  const bands = BANDS.map((band) => {
    const all = incidents.filter((i) => band.sizes.includes(i.size) && isFresh(i, asOf, on))
      .sort((a, b) => rank(a) - rank(b) || (a.size === POTENTIAL) - (b.size === POTENTIAL) || ms(b.last_updated) - ms(a.last_updated) || a.slug.localeCompare(b.slug));
    const big = all.slice(0, band.big), side = all.slice(band.big, band.big + band.side), rows = all.slice(band.big + band.side, band.big + band.side + band.rows);
    return { ...band, total: all.length, big, side, rows, more: all.length - big.length - side.length - rows.length };
  }).filter((b) => b.total > 0);
  return { asOf, on, bands };
}

// The newest real changes across every story, newest first. A check that found nothing is not
// a change; those are only counted.
export function liveUpdates(incidents, asOf) {
  const all = [];
  let quiet = 0;
  for (const i of incidents) {
    if (!i.typed) continue;
    const log = i.loaded.t.update_log;
    log.forEach((r, n) => {
      const age = ms(asOf) - ms(r.logged_at);
      if (r.change_type === "checked_no_change" && age >= 0 && age <= DAY) quiet++;
      if (!(r.change_type in KINDS)) return;
      all.push({ i, at: r.logged_at, headline: r.headline, kind: n === log.length - 1 ? "New story" : KINDS[r.change_type], newest: r.logged_at === i.last_updated });
    });
  }
  all.sort((a, b) => ms(b.at) - ms(a.at) || a.i.slug.localeCompare(b.i.slug));
  const recent = all.filter((u) => ms(asOf) - ms(u.at) <= LIVE_HOURS * HOUR);
  return { rows: (recent.length >= LIVE_MIN ? recent : all.slice(0, LIVE_MIN)).slice(0, LIVE_MAX), quiet };
}

// ---------- drawing ----------
const groupOf = (i) => ANSWER_GROUPS.find((g) => g.key === (i.answer_group || "unclear")) || ANSWER_GROUPS[0];
const ago = (iso, cls = "") => `<time class="ago${cls ? ` ${cls}` : ""}" datetime="${esc(iso)}">${esc(fmtDate(iso))}</time>`;
const STATE_CHIPS = { down: ["ftag-down", "Down now"], "partly-back": ["ftag-partly", "Partly back"] };
const stateChip = (i) => (isDown(i) ? `<span class="ftag ${STATE_CHIPS[i.service.state][0]}">${STATE_CHIPS[i.service.state][1]}</span>` : "");
const stateWords = (i) => (i.service ? { down: "down now", "partly-back": "partly back", back: "back" }[i.service.state] : "");
const answerLine = (i) => [groupOf(i).short, i.size === POTENTIAL ? "potential" : ""].filter(Boolean).join(" · ");

// The picture on a tile: the incident's photograph, or its name on a plate in the answer's colour.
function tileMedia(i) {
  const { image } = incidentPicture(i.loaded.head, i.dataPath);
  if (image) return `<span class="fcard-media"><img src="${esc(`${i.dataPath}/${image.file}`)}" width="${image.width}" height="${image.height}" alt="${esc(image.alt)}"${/(^|-)logo(-|$)/.test(image.id) ? ' class="is-logo"' : ""} loading="lazy" decoding="async"></span>`;
  const name = i.subject?.name || i.title;
  const fit = name.length > 22 ? " np-xs" : name.length > 12 ? " np-s" : "";
  return `<span class="fcard-media"><span class="nameplate${fit}">${esc(name)}</span></span>`;
}
function tile(i, kind, front) {
  const isNew = ms(front.asOf) - ms(i.first_published) <= NEW_HOURS * HOUR;
  const text = front.on.lines.get(i.slug) || i.question.answer;
  return `<li class="fcard fcard-${kind} a-${esc(groupOf(i).key)}"><a href="incidents/${esc(i.slug)}.html">
${tileMedia(i)}
<span class="fcard-body">
<span class="fcard-meta">${isNew ? `<span class="ftag ftag-new">New story</span>` : ""}${stateChip(i)}<span>${isNew ? "" : "Updated "}${ago(i.last_updated)}</span></span>
<span class="fcard-answer">${esc(answerLine(i))}</span>
<strong class="fcard-title">${esc(i.question.text)}</strong>
<span class="fcard-text">${esc(text)}</span>
</span></a></li>`;
}
function row(i, name) {
  return `<li class="srow a-${esc(groupOf(i).key)}"><a href="incidents/${esc(i.slug)}.html">${ago(i.last_updated, "srow-when")}<span class="srow-name">${esc(name(i))}</span><span class="srow-text">${esc(i.latest.headline)}</span><span class="srow-answer">${esc([answerLine(i), stateWords(i)].filter(Boolean).join(" · "))}</span></a></li>`;
}

export function renderBands(front, { name }) {
  return front.bands.map((b) => {
    const list = (cls, items, draw) => (items.length ? `<ul class="${cls}">\n${items.map(draw).join("\n")}\n</ul>` : "");
    return `<section class="sband" aria-labelledby="sb-${b.key}">
<div class="sband-head">${sizeBars(b.bars, { label: `Size: ${b.bars} of 4` })}<h2 id="sb-${b.key}">${esc(b.title)}</h2><p class="meta">${esc(b.gloss)}</p></div>
${[list("fcards fcards-big", b.big, (i) => tile(i, "big", front)), list("fcards", b.side, (i) => tile(i, "side", front)), list("srows", b.rows, (i) => row(i, name))].filter(Boolean).join("\n")}
${b.more > 0 ? `<p class="meta sband-more"><a href="#incidents">${b.more} more in the full list</a></p>` : ""}
</section>`;
  }).join("\n");
}

export function renderLive(front, incidents, { name }) {
  const { rows, quiet } = liveUpdates(incidents, front.asOf);
  if (!rows.length) return "";
  const item = (u) => `<li class="a-${esc(groupOf(u.i).key)}"><a href="incidents/${esc(u.i.slug)}.html"><span class="live-top">${ago(u.at)}<span class="ftag ${u.kind === "New story" ? "ftag-new" : u.kind === "Correction" ? "ftag-kind ftag-fix" : "ftag-kind"}">${esc(u.kind)}</span>${u.newest ? stateChip(u.i) : ""}</span><span class="live-name">${esc(name(u.i))}</span><span class="live-text">${esc(u.headline)}</span></a></li>`;
  return `<aside class="live" aria-labelledby="live-h">
<h2 id="live-h"><span class="live-dot" aria-hidden="true"></span>Live updates</h2>
<p class="meta">What changed in our stories, newest first.</p>
<ol class="live-list">
${rows.map(item).join("\n")}
</ol>
<p class="meta live-foot">${quiet ? `${quiet} routine check${quiet === 1 ? "" : "s"} in the past day found nothing new. ` : ""}<a href="status.html">Every story's last check</a></p>
</aside>`;
}
