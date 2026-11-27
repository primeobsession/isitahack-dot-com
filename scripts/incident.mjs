// Renders one incident, loaded and checked by validate.mjs, as page HTML and as
// a Markdown export. Pure functions of the loaded data: no clock, no locale.
// Also holds the page layout that typed and hand-written incident pages share.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { LABELS, ANSWER_GROUPS, answerPill, withoutAnswerWords, sizeBars, esc, slugify, pill, inline, linkTag, fmtDate, fmtTime, fmtDay, timeTag, renderBody, tableHtml } from "./html.mjs";
import { renderChart, fmtNumber } from "./chart.mjs";
import { renderPlate } from "./plate.mjs";

// A smaller copy of an image for pages that show it a few hundred pixels wide:
// images/<name>.small.<ext> beside the original, 800 pixels wide (format/README.md). Shared
// links and image sections keep the original. Without the small copy, the original is used.
export function smallFile(dir, image) {
  if (!dir || !image) return null;
  const small = image.file.replace(/\.([a-z]+)$/, ".small.$1");
  return small !== image.file && existsSync(join(dir, small)) ? small : null;
}

// The incident's picture: its photograph when it has one, otherwise the drawn plate.
// `base` is where the incident's data folder is, as seen from the page; `dir` is that folder
// on disk, so the small copy is used when there is one.
export function incidentPicture(head, base, dir = null) {
  const image = head.lead_image && (head.images || []).find((x) => x.id === head.lead_image);
  if (!image) return { html: renderPlate(head.subject), credit: "", caption: "", image: null };
  const file = smallFile(dir, image) || image.file;
  return {
    html: `<img src="${esc(`${base}/${file}`)}" width="${image.width}" height="${image.height}" alt="${esc(image.alt)}"${image.rights === "logo" || /(^|-)logo(-|$)/.test(image.id) ? ' class="is-logo"' : ""} fetchpriority="high">`,
    credit: `Image: ${image.credit}`, caption: image.caption || "", image,
  };
}

const TIERS = { 1: "Official source", 2: "News outlet", 3: "Researcher or analysis", 4: "Social post", 5: "Rumor source" };
const CHANGES = {
  added: "Added", updated: "Updated", label_change: "Label change", correction: "Correction",
  staleness_check: "Staleness check", checked_no_change: "Checked, no change", blocked_source: "Source blocked",
  presentation: "Wording or layout only",
};
// Rows that record no change to the findings never become "the latest", and a
// wording-only row does not count as a check either.
const QUIET = new Set(["checked_no_change", "presentation"]);
// "the FAA outage" / "X and Y" / "X, Y and Z"
const listOf = (items) => (items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
export const alsoCalled = (head) => (head.also_called?.length ? `Also reported as ${listOf(head.also_called)}.` : "");
const STATUSES = { monitoring: "Monitoring", resolved: "Resolved", closed: "Closed" };
const STANDARD_NOTE = `<strong>Not verified: initial investigation only.</strong> Nothing on this page is absolutely confirmed. It is an early look based only on publicly available sources, and it should not be treated as verified fact. Even items labeled "Confirmed" only mean a public source reports them.`;
const two = (n) => String(n).padStart(2, "0");

// When the next check is due, by the decided cadence (operations manual section 3): every hour
// while something is down during a story's first three days, and once a day while it is still
// down after that; otherwise once a day for the first three days, every three days until it is
// resolved, then weekly. A daily or slower check is due by the end of its day, in the offset
// the last check was logged with. A closed story is not checked again.
const HOUR = 36e5, DAY = 864e5;
export const CADENCES = { hour: "every hour while it is down, for the story's first three days", "still down": "once a day while it is still down", day: "once a day for the first three days", "3 days": "every three days until it is resolved", week: "once a week now it is resolved" };
// The words for a next check: a daily check on something still down has its own.
export const cadenceText = (next) => CADENCES[next.down ? "still down" : next.every];
function atOffset(ms, offset) {
  const mins = offset === "Z" ? 0 : (offset[0] === "-" ? -1 : 1) * (+offset.slice(1, 3) * 60 + +offset.slice(4, 6));
  return `${new Date(ms + mins * 6e4).toISOString().slice(0, 19)}${offset}`;
}
export function nextCheck({ status, service, first_published, last_checked }) {
  const offset = String(last_checked || "").match(/T.*(Z|[+-]\d\d:\d\d)$/)?.[1];
  if (status === "closed" || !offset) return null;
  const dayOf = (iso) => Date.parse(`${atOffset(Date.parse(iso), offset).slice(0, 10)}T00:00:00Z`);
  const day = dayOf(last_checked);
  const early = (day - dayOf(first_published || last_checked)) / DAY < 3;
  const down = Boolean(service) && service.state !== "back";
  if (down && early) return { every: "hour", due: atOffset(Date.parse(last_checked) + HOUR, offset) };
  const days = down || (early && status !== "resolved") ? 1 : status === "resolved" ? 7 : 3;
  const next = { every: days === 7 ? "week" : days === 1 ? "day" : "3 days", due: `${new Date(day + days * DAY).toISOString().slice(0, 10)}T23:59:00${offset}` };
  return down ? { ...next, down: true } : next;
}
// "by 4:12 PM ET, Nov 24" for an hourly check, "by the end of Nov 27, 2026" for the rest.
export const dueText = (next) => (next.every === "hour" ? fmtDate(next.due) : `the end of ${fmtDay(next.due)}`);

// Everything other pages need to know about an incident, worked out from its data.
export const SERVICE_STATES = { down: "Down at our last check", "partly-back": "Partly back at our last check", back: "Back" };
export function summarize({ head, t }) {
  // Whether the thing that went down is back: only where a sourced claim says so.
  const stateClaim = head.service && t.claims.find((c) => c.claim_id === head.service.claim_id);
  const latest = t.update_log.find((r) => !QUIET.has(r.change_type));
  const checked = t.update_log.find((r) => r.change_type !== "presentation");
  const main = t.questions.find((q) => q.question_id === head.main_question_id);
  const tallyGroup = head.sections.find((s) => s.type === "claims")?.group;
  const inGroup = t.claims.filter((c) => c.group === tallyGroup);
  const first = t.update_log[t.update_log.length - 1].logged_at;
  return {
    slug: head.slug, title: head.title, status: head.status, incident_date: head.incident_date, disclaimer: head.disclaimer,
    last_updated: latest.logged_at, last_checked: checked.logged_at,
    next_check: nextCheck({ status: head.status, service: stateClaim && head.service, first_published: first, last_checked: checked.logged_at }),
    first_published: first, also_called: alsoCalled(head),
    latest: { at: latest.logged_at, headline: latest.headline, summary: latest.summary },
    question: { text: main.question_text, answer: main.answer_text, label: main.label, claim_ids: main.claim_ids },
    verdict: head.verdict || null, verdict_approved_at: head.verdict_approved_at || null,
    size: head.size, subject: head.subject, incident_type: head.incident_type, answer_group: head.answer_group, also_names: head.also_called || [],
    service: stateClaim ? { state: head.service.state, claim_id: stateClaim.claim_id, text: stateClaim.claim_text, as_of: stateClaim.last_checked || null } : null,
    tally: Object.fromEntries(LABELS.map((l) => [l, inGroup.filter((c) => c.label === l).length])),
    tally_title: head.sections.find((s) => s.type === "claims")?.title || "Claims",
    counts: { sources: t.sources.length, updates: t.update_log.length, events: t.timeline.length },
  };
}

// ---------- shared pieces ----------
// One bar for a set of labelled rows: each label gets a share of the width and
// the same fill, border and dot it has everywhere else on the site.
export function evidenceBar(tally, title) {
  const parts = LABELS.map((l) => [l, Number(tally[l]) || 0]).filter(([, n]) => n > 0);
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return "";
  const cls = (l) => l.toLowerCase().replace(/ /g, "-");
  return `<div class="evidence">
<p class="kicker">${esc(title)} · ${total}</p>
<div class="evidence-bar" role="img" aria-label="${esc(parts.map(([l, n]) => `${l} ${n}`).join(", "))}">${parts.map(([l, n]) => `<span class="seg seg-${cls(l)}" style="flex-grow:${n}"></span>`).join("")}</div>
<ul class="evidence-key">${parts.map(([l, n]) => `<li>${pill(l)}<span class="count">${n}</span></li>`).join("")}</ul>
</div>`;
}

const otherIncidents = (others, root) => `<section class="side-block">
<p class="kicker">Other incidents</p>
${others.length
    ? `<ul class="others">\n${others.slice(0, 5).map((o) => `<li><a href="${esc(o.slug)}.html">${esc(o.title)}</a><span class="meta">${esc(STATUSES[o.status] || o.status)} · updated ${timeTag(o.last_updated, fmtDay(o.last_updated))}</span></li>`).join("\n")}\n</ul>`
    : `<p class="meta">This is the only incident being tracked so far.</p>`}
<p><a href="${root}#incidents">All incidents</a></p>
</section>`;

// The layout every incident page uses: a contents list that follows the reader,
// the report in the middle, and a side rail with the latest and other incidents.
// `toc` is [{ id, name, count }]; `lead`, `main` and `facts` are ready-made HTML.
export function incidentLayout({ root, slug, crumb, title, titleId = "", aka = "", media = "", lead = "", toc, main, facts = "", others, repo, historyPath }) {
  // An entry with `n` is one of the page's depths; one with `sub` is a section inside that depth.
  const tocHtml = toc.map((s, i) => `<li${s.sub ? ` class="toc-sub toc-in-${esc(s.sub)}"` : s.n ? ' class="toc-top"' : ""}><a href="#${esc(s.id)}">${s.sub ? "" : `<span class="toc-n">${esc(s.n || two(i + 1))}</span>`}<span class="toc-name">${esc(s.name)}</span>${s.count !== undefined && s.count !== "" ? `<span class="count">${esc(s.count)}</span>` : ""}</a></li>`).join("\n");
  return `<main id="main" class="incident">
<div class="wrap page-grid">
<header class="page-head${media ? " has-media" : ""}">
<div class="head-text">
<p class="crumb">${crumb}</p>
<h1${titleId ? ` id="${esc(titleId)}"` : ""}>${title}</h1>${aka ? `\n${aka}` : ""}
</div>${media ? `\n${media}` : ""}
${lead}
</header>
<nav class="toc" aria-label="On this page">
<p class="kicker">On this page</p>
<ol>
${tocHtml}
</ol>
</nav>
<div class="page-main">
${main}
<footer class="page-foot">
<p><a href="${esc(slug)}.md">Markdown version</a><a href="${esc(`${repo}/commits/main/${historyPath}`)}" rel="noopener">Edit history</a><a href="${root}about.html#contact">Report an error</a></p>
<p class="meta">Reading this as an AI assistant or a program? The same report is available as plain Markdown at <a href="${esc(slug)}.md">${esc(slug)}.md</a>, and <a href="${root}llms.txt">llms.txt</a> maps the whole site.</p>
</footer>
</div>
<aside class="side" aria-label="Summary and other incidents">
<div class="side-facts">
${facts}
</div>
<div class="side-more">
${otherIncidents(others, root)}
</div>
</aside>
</div>
</main>`;
}

// A row is always open: the claim, its label, and what it rests on, all in view.
const row = ({ id, lead, title, sub, trail = "", body }) => `<article class="row"${id ? ` id="${esc(id)}"` : ""}>
<div class="row-head"><span class="row-lead">${lead}</span><span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>${trail ? `<span class="row-trail">${trail}</span>` : ""}</div>
<div class="row-body">
${body}
</div>
</article>`;

export function renderIncident(loaded, { root, dataHref, dir, repo, follow = "", others }) {
  const { head, t, chartData, tableData } = loaded;
  const sum = summarize(loaded);
  const claims = new Map(t.claims.map((c) => [c.claim_id, c]));
  const sources = new Map(t.sources.map((s) => [s.source_id, s]));
  const shownGroups = new Set(head.sections.filter((s) => s.type === "claims").map((s) => s.group));
  const eventByClaim = new Map(t.timeline.map((e) => [e.claim_id, e]));

  const sourceLink = (id) => { const s = sources.get(id); return linkTag(s.source_url, esc(s.source_name)); };
  const sourceLine = (id) => {
    const s = sources.get(id);
    const status = s.link_status === "ok" ? "" : s.link_status === "blocked" ? " · not re-checked: site blocks automated access"
      : ` · link ${esc(s.link_status)}${s.archive_url ? `; ${linkTag(s.archive_url, "archived copy")}` : ""}`;
    return `<li>${sourceLink(id)} <span class="meta">${esc(TIERS[s.source_tier])}${s.source_date ? ` · ${esc(fmtDate(s.source_date))}` : ""}${status}</span></li>`;
  };
  // Where a mention of a claim should link: its row, its timeline event, or its primary source.
  const claimHref = (id) => {
    const c = claims.get(id);
    if (shownGroups.has(c.group)) return `#${id}`;
    if (eventByClaim.has(id)) return `#${eventByClaim.get(id).event_id}`;
    return sources.get(c.source_ids[0]).source_url;
  };
  const claimBody = (c) => `<p><span class="field">Why it supports</span> ${esc(c.why_it_supports)}</p>${c.detail ? `\n<p>${inline(c.detail)}</p>` : ""}
<ul class="source-lines">
${c.source_ids.map(sourceLine).join("\n")}
</ul>${c.last_checked ? `\n<p class="meta">Last checked ${timeTag(c.last_checked)}</p>` : ""}`;

  // ---------- sections ----------
  const ids = new Map();
  const uniqueId = (text) => { const base = slugify(text); const n = (ids.get(base) || 0) + 1; ids.set(base, n); return n === 1 ? base : `${base}-${n}`; };
  for (const reserved of ["glance", "update-log", "sources", "main", "the-question", "what-is-it", "what-happened", "is-it-back", "who-is-affected", "how-big", "what-has-been-said", "numbers", "raw-files"]) ids.set(reserved, 1);
  // The page is one scroll: the questions a reader asks, in the order they ask them. Nothing is
  // folded away. A block is one titled part inside a question; `sub` says which question.
  const subToc = [];
  const fold = ({ title, count = "", body, id, sub = "what-has-been-said" }) => {
    const sid = id || uniqueId(title);
    subToc.push({ id: sid, name: title, count, sub });
    return `<section class="block" id="${esc(sid)}">
<div class="block-head"><h3>${esc(title)}</h3>${count !== "" ? `<span class="count">${esc(count)}</span>` : ""}</div>
<div class="fold-body">
${body}
</div>
</section>`;
  };
  const intro = (s) => (s.intro ? `<p class="intro">${esc(s.intro)}</p>\n` : "");

  const renderers = {
    claims(s) {
      const list = t.claims.filter((c) => c.group === s.group);
      const rows = list.map((c) => row({ id: c.claim_id, lead: pill(c.label), title: esc(c.claim_text), sub: esc(c.summary), body: claimBody(c) }));
      return fold({ title: s.title, count: list.length, body: `${intro(s)}<div class="rows">\n${rows.join("\n")}\n</div>` });
    },
    timeline(s) {
      const events = t.timeline; // file order: the order things happened
      const multiDay = new Set(events.map((e) => e.event_time.slice(0, 10))).size > 1;
      const rows = events.map((e) => {
        const c = claims.get(e.claim_id);
        const clock = e.time_text || (e.event_time.length === 10 ? "" : `${e.time_basis === "approximate" ? "~" : ""}${fmtTime(e.event_time)}`);
        const day = multiDay || !clock ? `<span class="row-day">${esc(fmtDay(e.event_time).replace(/, \d{4}$/, ""))}</span> ` : "";
        const when = `${day}${clock ? timeTag(e.event_time, clock) : ""}${e.event_end_time ? `<span class="row-until"> to ${esc(fmtTime(e.event_end_time))}</span>` : ""}`;
        const basis = e.time_basis === "inferred" ? `<p class="meta">Time inferred${e.notes ? `: ${esc(e.notes)}` : ""}</p>\n` : e.notes ? `<p class="meta">${esc(e.notes)}</p>\n` : "";
        const repeats = c.why_it_supports.startsWith(c.summary) || c.summary.startsWith(c.why_it_supports);
        // The claim's full evidence is listed once, under "everything that has been said"; the
        // timeline points to it. A claim shown nowhere else keeps its evidence here.
        const body = shownGroups.has(c.group)
          ? `${basis}<p class="meta"><a class="ref" href="#${esc(c.claim_id)}">Evidence and sources</a></p>`
          : `${repeats ? "" : `<p>${esc(c.summary)}</p>\n`}${basis}${claimBody(c)}`;
        return row({ id: e.event_id, lead: when, title: esc(e.event_text), trail: pill(c.label), body });
      });
      const zone = events.length ? fmtDate(events[0].event_time).split(" ").pop() : "";
      return fold({ title: s.title, count: events.length, sub: "what-happened", body: `${intro(s)}<p class="meta">Times are ${zone === "ET" ? "Eastern" : esc(zone)}.</p>\n<div class="rows rows-timeline">\n${rows.join("\n")}\n</div>` });
    },
    questions(s) {
      const rows = t.questions.map((q) => {
        const lead = q.state === "answered" ? pill(q.label) : `<span class="chip">Open</span>`;
        const body = [
          q.what_would_settle_it ? `<p><span class="field">What would settle it</span> ${esc(q.what_would_settle_it)}</p>` : "",
          q.claim_ids.length ? `<p><span class="field">Rests on</span> ${q.claim_ids.map((id) => `<a href="${esc(claimHref(id))}">${esc(claims.get(id).claim_text)}</a>`).join(" · ")}</p>` : "",
          `<p class="meta">${q.kind === "rumor" ? "Rumor" : "Question"} recorded ${timeTag(q.opened_at)}${q.answered_at ? ` · answered ${timeTag(q.answered_at)}` : ""}</p>`,
        ].filter(Boolean).join("\n");
        return row({ id: q.question_id, lead, title: esc(q.question_text), sub: q.answer_text ? esc(q.answer_text) : "Not answered yet.", body });
      });
      return fold({ title: s.title, count: rows.length, body: `${intro(s)}<div class="rows">\n${rows.join("\n")}\n</div>` });
    },
    quotes(s) {
      const list = t.quotes.filter((q) => q.group === s.group);
      const items = list.map((q) => {
        const bits = [esc(q.speaker), q.context ? esc(q.context) : "", q.said_at ? esc(fmtDate(q.said_at)) : "", sourceLink(q.source_id), q.confidence ? `confidence: ${esc(q.confidence)}` : ""].filter(Boolean);
        return `<figure class="quote" id="${esc(q.quote_id)}">\n<blockquote><p>${esc(q.quote_text)}</p></blockquote>\n<figcaption>${bits.join(" · ")}${q.notes ? `<br>${esc(q.notes)}` : ""}</figcaption>\n</figure>`;
      });
      return fold({ title: s.title, count: list.length, body: `${intro(s)}${items.join("\n")}` });
    },
    chart(s) {
      const chart = head.charts.find((c) => c.id === s.id);
      const rows = chartData[chart.id];
      const headRow = [chart.x.label, ...chart.series.map((x) => x.label)];
      const body = rows.map((r) => [esc(chart.x.kind === "time" ? fmtDate(r[chart.x.column]) : r[chart.x.column]), ...chart.series.map((x) => (r[x.column] === "" ? "" : esc(fmtNumber(Number(r[x.column])))))]);
      return fold({ title: chart.title, id: uniqueId(chart.id), body: `<figure class="figure">
${renderChart(chart, rows)}
<figcaption>${chart.caption ? `${esc(chart.caption)} ` : ""}Source: ${chart.source_ids.map(sourceLink).join(", ")}.</figcaption>
</figure>
<p class="meta">The numbers behind the chart</p>
${tableHtml(headRow, body)}` });
    },
    image(s) {
      const image = head.images.find((i) => i.id === s.id);
      const credit = `${esc(image.credit)}${image.source_id ? `, via ${sourceLink(image.source_id)}` : image.source_url ? ` (${linkTag(image.source_url, "source")})` : ""}`;
      return fold({ title: image.title, id: uniqueId(image.id), body: `<figure class="figure">
<img src="${esc(`${dataHref}/${image.file}`)}" width="${image.width}" height="${image.height}" alt="${esc(image.alt)}" loading="lazy">
<figcaption>${image.caption ? `${esc(image.caption)} ` : ""}Image: ${credit}.</figcaption>
</figure>` });
    },
    table(s) {
      const table = head.tables.find((x) => x.id === s.id);
      const cell = (c, v) => (v == null ? "" : c.type === "label" ? pill(v) : c.type === "source" ? sourceLink(v) : c.type === "number" ? esc(fmtNumber(v)) : inline(String(v)));
      const body = tableData[table.id].map((r) => table.columns.map((c) => cell(c, r[c.name])));
      return fold({ title: table.title, count: body.length, id: uniqueId(table.id), body: `${table.intro ? `<p class="intro">${esc(table.intro)}</p>\n` : ""}${tableHtml(table.columns.map((c) => c.label), body)}` });
    },
    note(s) {
      const doc = renderBody(readFileSync(join(dir, s.file), "utf8"));
      const blocks = [...doc.pre, ...doc.sections.flatMap((x) => [`<h3>${inline(x.heading)}</h3>`, ...x.blocks])];
      return fold({ title: s.title, body: `<div class="prose">\n${blocks.join("\n")}\n</div>` });
    },
  };
  // The timeline answers "what happened", so it sits there; every other section is part of
  // "everything that has been said", in the order the incident lists them.
  const timelineSection = head.sections.find((s) => s.type === "timeline");
  const timelineHtml = timelineSection ? renderers.timeline(timelineSection) : "";
  const sectionsHtml = head.sections.filter((s) => s.type !== "timeline").map((s) => renderers[s.type](s)).join("\n\n");

  // A check that found nothing is one line: when, and what was still true. Its working note
  // stays in the data. Every other entry shows its headline and its note.
  const logRows = t.update_log.map((u) => (u.change_type === "checked_no_change"
    ? `<li class="log-row quiet log-brief" id="${esc(u.log_id)}">
<span class="log-when">${timeTag(u.logged_at)}</span>
<span class="log-what">${esc(u.headline)} <span class="meta">${esc(CHANGES[u.change_type])}</span></span>
</li>`
    : `<li class="log-row${QUIET.has(u.change_type) ? " quiet" : ""}" id="${esc(u.log_id)}">
<span class="log-when">${timeTag(u.logged_at)}</span>
<span class="log-what"><strong>${esc(u.headline)}</strong> ${esc(u.summary)} <span class="meta">${esc(CHANGES[u.change_type])}</span></span>
</li>`));
  const logHtml = `<p class="meta">Every check and change, newest first. Last checked ${timeTag(sum.last_checked)}.${sum.next_check ? ` The next check is due by ${timeTag(sum.next_check.due, dueText(sum.next_check))}: the desk checks ${cadenceText(sum.next_check)}.` : ""}</p>\n<ol class="log">\n${logRows.join("\n")}\n</ol>`;
  const sourcesHtml = `<ol class="source-lines numbered">\n${t.sources.map((s) => sourceLine(s.source_id)).join("\n")}\n</ol>`;

  // ---------- the top of the page ----------
  const q = sum.question;
  const verdictNote = sum.verdict
    ? `<p class="verdict"><span class="verdict-badge">${esc(sum.verdict)}</span> Final verdict, approved by the site's owner on ${timeTag(sum.verdict_approved_at, fmtDay(sum.verdict_approved_at))}.</p>`
    : `<p class="answer-note">This is the current answer, not a final verdict. A final verdict is published only after the site's owner has reviewed the evidence.</p>`;
  // The main question is the page's heading; the box under it answers it.
  const picture = incidentPicture(head, dataHref, dir);
  // A photograph says what it shows and who made it; the credit links to where it came from.
  const pictureFrom = picture.image && (picture.image.source_url || (picture.image.source_id && sources.get(picture.image.source_id).source_url));
  const pictureCredit = picture.credit ? (pictureFrom ? linkTag(pictureFrom, esc(picture.credit)) : esc(picture.credit)) : "";
  const media = `<figure class="head-media">${picture.html}${pictureCredit ? `<figcaption>${picture.caption ? `${esc(picture.caption)} ` : ""}${pictureCredit}</figcaption>` : ""}</figure>`;
  // The plain answer comes first; the evidence label says how well it is supported.
  const group = ANSWER_GROUPS.find((g) => g.key === head.answer_group);
  const SIZE_BARS = { Local: 1, Regional: 2, Large: 3, "Nation-level": 4, "Nation-level potential": 4 };
  const potential = head.size === "Nation-level potential";
  const sizeLine = `${sizeBars(SIZE_BARS[head.size], { potential, label: `Size: ${head.size}` })}<strong>${esc(potential ? "Nation-level, but only if the worst case were true" : head.size)}</strong>`;
  const STATE_TAGS = { down: ["ftag-down", "Down now"], "partly-back": ["ftag-partly", "Partly back"], back: ["ftag-kind", "Back"] };
  const stateTag = sum.service ? `<span class="ftag ${STATE_TAGS[sum.service.state][0]}">${STATE_TAGS[sum.service.state][1]}</span>` : "";
  // Following by email: one message when the story changes. A closed story is not checked again.
  const followCta = follow && head.status !== "closed"
    ? `\n<p class="follow-cta"><a class="button secondary" href="${esc(`${follow}?story=${encodeURIComponent(head.slug)}`)}" rel="noopener">Follow this story by email</a><span class="meta">An email when the answer or the facts change. No account, and you can stop any time.</span></p>`
    : "";
  const lead = `<section class="answer-box" aria-labelledby="the-question">
<div class="answer-head"><p class="kicker">Is it a hack? The short answer</p>${answerPill(group, "answer-pill")}</div>
<p class="answer">${esc(withoutAnswerWords(q.answer, group))}</p>
<p class="answer-facts">${stateTag}<span class="size-line">${sizeLine}</span></p>
<p class="answer-refs"><span class="field">How well supported</span> ${pill(q.label)}</p>
<p class="answer-refs"><span class="field">Rests on</span> ${q.claim_ids.map((id) => `<a href="${esc(claimHref(id))}">${esc(claims.get(id).claim_text)}</a>`).join(" · ")}</p>
${verdictNote}
</section>${followCta}
<p class="byline">By the isitahack.com desk. First published ${timeTag(sum.first_published, fmtDay(sum.first_published))}. AI agents research public sources and label each claim; a person decides only the final verdict. <a href="${root}how-it-works.html">How it works</a></p>`;
  const tiles = (head.figures || []).map((f) => `<li class="tile"><a href="${esc(claimHref(f.claim_id))}"><span class="tile-value">${esc(f.value)}</span><span class="tile-label">${esc(f.label)}</span>${f.detail ? `<span class="tile-detail">${esc(f.detail)}</span>` : ""}</a></li>`).join("\n");
  const known = head.known.map((k) => `<li>${esc(k.text)} <a class="ref" href="${esc(claimHref(k.claim_id))}">evidence</a></li>`).join("\n");
  const notKnown = head.not_known.map((k) => `<li>${esc(k.text)}${k.question_id ? ` <a class="ref" href="#${esc(k.question_id)}">open question</a>` : ""}</li>`).join("\n");

  const facts = `<section class="side-block">
${evidenceBar(sum.tally, sum.tally_title)}
<p><a href="${root}how-it-works.html">What the labels mean</a></p>
</section>`;

  // ---------- the page: the questions a reader asks, in the order they ask them ----------
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const allTally = Object.fromEntries(LABELS.map((l) => [l, t.claims.filter((c) => c.label === l).length]));
  const about = head.subject.about;
  const hostOf = (url) => new URL(url).hostname.replace(/^www\./, "");
  const parts = [
    about && { id: "what-is-it", name: `What is ${head.subject.name}?`, html: `<p class="q-lede">${esc(about)}</p>\n<p class="meta">From ${linkTag(head.subject.about_url, esc(hostOf(head.subject.about_url)))}</p>` },
    { id: "what-happened", name: "What happened?", html: `<div class="latest-box"><p class="kicker accent">The latest · ${timeTag(sum.latest.at)}</p><p class="latest-headline">${esc(sum.latest.headline)}</p></div>${tiles ? `\n<ul class="tiles" id="numbers">\n${tiles}\n</ul>` : ""}${timelineHtml ? `\n${timelineHtml}` : ""}` },
    sum.service && { id: "is-it-back", name: sum.service.state === "back" ? "Is it back?" : "Is it still down?", html: `<p class="q-lede"><strong>${esc(SERVICE_STATES[sum.service.state])}.</strong> ${esc(sum.service.text.replace(/[.\s]+$/, ""))}. <a class="ref" href="${esc(claimHref(sum.service.claim_id))}">evidence</a></p>${sum.service.as_of ? `\n<p class="meta">Checked ${timeTag(sum.service.as_of)}</p>` : ""}` },
    { id: "who-is-affected", name: "Does it affect me?", html: `<p class="q-lede">${esc(head.who_is_affected)}</p>` },
    { id: "how-big", name: "How big is it?", html: `<p class="size-line">${sizeLine}</p>\n<p class="q-lede">${esc(head.size_basis)}</p>` },
    { id: "glance", name: "What we know, and what we don't", html: `<div class="known-grid">
<div class="known"><h3>Known so far</h3>${known ? `<ul>\n${known}\n</ul>` : `<p>Nothing is established yet.</p>`}</div>
<div class="not-known"><h3>Not known yet</h3>${notKnown ? `<ul>\n${notKnown}\n</ul>` : `<p>No open questions are recorded.</p>`}</div>
</div>
<aside class="note">
<p>${STANDARD_NOTE}</p>
<p>${esc(head.disclaimer)}</p>
</aside>` },
    { id: "what-has-been-said", name: "Everything that has been said", count: t.claims.length, html: `<p class="meta">${plural(t.claims.length, "claim", "claims")}, each with a label saying how well it is supported and the sources it rests on.</p>
${evidenceBar(allTally, "Every claim on this page, by label")}
${sectionsHtml}` },
    { id: "sources", name: "Where this comes from", count: t.sources.length, html: sourcesHtml },
    { id: "update-log", name: "Every update", count: t.update_log.length, html: logHtml },
  ].filter(Boolean);
  const main = `${parts.map((p) => `<section class="q" id="${p.id}">\n<h2>${esc(p.name)}</h2>\n${p.html}\n</section>`).join("\n\n")}

<section class="raw-files" id="raw-files">
<h2>The raw files</h2>
<p>For people and programs that want the data itself. Nothing on this page exists only here.</p>
<p class="raw-links"><a href="${esc(head.slug)}.md">This report as Markdown</a><a href="${esc(`${repo}/tree/main/data/incidents/${head.slug}`)}" rel="noopener">The data folder on GitHub</a><a href="${esc(`${repo}/commits/main/data/incidents/${head.slug}`)}" rel="noopener">Every change to this page</a></p>
</section>`;
  // The contents list names the same questions, with the parts inside each.
  const toc = [{ id: "the-question", name: "The short answer", n: "01" }];
  parts.forEach((p, i) => {
    toc.push({ id: p.id, name: p.name, n: two(i + 2), count: p.count });
    for (const part of subToc) if (part.sub === p.id) toc.push(part);
  });

  const TYPES = { outage: "Outage", breach: "Data breach", attack: "Attack" };
  const html = incidentLayout({
    root, slug: head.slug, repo, others, toc, lead, main, facts, media,
    aka: sum.also_called ? `<p class="aka">${esc(sum.also_called)}</p>` : "",
    crumb: `<a href="${root}#incidents">Incidents</a> / ${esc(TYPES[head.incident_type])} · ${timeTag(head.incident_date)}`,
    title: esc(q.text), titleId: "the-question", historyPath: `data/incidents/${head.slug}`,
  });
  return { main: html, sum };
}

// ---------- Markdown export ----------
// A plain-text version of the same page for people and programs that prefer it.
// It is an output: the data files are the source.
const cellMd = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
const tableMd = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cellMd).join(" | ")} |`)].join("\n");

export function incidentMarkdown(loaded, { dataPath }) {
  const { head, t, chartData, tableData } = loaded;
  const sum = summarize(loaded);
  const claims = new Map(t.claims.map((c) => [c.claim_id, c]));
  const sources = new Map(t.sources.map((s) => [s.source_id, s]));
  const src = (id) => { const s = sources.get(id); return `[${s.source_name}](${s.source_url})`; };
  const out = [];
  out.push(`---\nslug: ${head.slug}\ntitle: ${JSON.stringify(head.title)}\nquestion: ${JSON.stringify(sum.question.text)}\nstatus: ${head.status}\nincident_date: ${head.incident_date}\nfirst_published: ${sum.first_published}\nlast_updated: ${sum.last_updated}\nlast_checked: ${sum.last_checked}${sum.next_check ? `\nnext_check_due: ${sum.next_check.due}` : ""}\nsize: ${JSON.stringify(head.size)}\ndata_dir: ${dataPath}\ngenerated: true\ndisclaimer: ${JSON.stringify(head.disclaimer)}\n---`);
  out.push(`<!-- Generated by scripts/build.mjs from ${dataPath}/. Do not edit this file; edit the data. -->`);
  out.push(`# ${sum.question.text}`);
  out.push(`**${sum.question.label}.** ${sum.question.answer}`);
  out.push(`Incident: ${head.title}.${sum.also_called ? ` ${sum.also_called}` : ""} First published ${fmtDay(sum.first_published)}; last updated ${fmtDate(sum.last_updated)}.`);
  const lead = head.lead_image && (head.images || []).find((x) => x.id === head.lead_image);
  if (lead) out.push(`Picture: ${lead.caption ? `${lead.caption} ` : ""}Image: ${lead.credit}${lead.source_url ? ` (${lead.source_url})` : ""}.`);
  out.push(`> **Not verified: initial investigation only.** Nothing on this page is absolutely confirmed. It is an early look based only on publicly available sources, and it should not be treated as verified fact. Even items labeled "Confirmed" only mean a public source reports them. ${head.disclaimer}`);
  if (head.subject.about) out.push(`## What is ${head.subject.name}?\n\n${head.subject.about} (${head.subject.about_url})`);
  out.push(sum.verdict ? `Final verdict: **${sum.verdict}**, approved by the site's owner on ${fmtDay(sum.verdict_approved_at)}.` : `This is the current answer, not a final verdict.`);
  out.push(`## The latest\n\n${fmtDate(sum.latest.at)}: **${sum.latest.headline}** ${sum.latest.summary}`);
  out.push(`## At a glance\n\n- Status: ${head.status}\n- Size: ${head.size}. ${head.size_basis}\n- Who is affected: ${head.who_is_affected}`);
  if (head.figures?.length) out.push(tableMd(["Value", "What", "Detail"], head.figures.map((f) => [f.value, f.label, f.detail || ""])));
  out.push(`### Known so far\n\n${head.known.map((k) => `- ${k.text}`).join("\n") || "- Nothing is established yet."}`);
  out.push(`### Not known yet\n\n${head.not_known.map((k) => `- ${k.text}`).join("\n") || "- No open questions are recorded."}`);
  for (const s of head.sections) {
    if (s.type === "claims") {
      const list = t.claims.filter((c) => c.group === s.group);
      out.push(`## ${s.title}\n\n${tableMd(["Claim", "Label", "What we know", "Why it supports, and more detail", "Sources"], list.map((c) => [c.claim_text, c.label, c.summary, [c.why_it_supports, c.detail].filter(Boolean).join(" "), c.source_ids.map(src).join(", ")]))}`);
    } else if (s.type === "timeline") {
      const when = (e) => `${e.time_text ? `${fmtDay(e.event_time)}, ${e.time_text}` : `${e.time_basis === "approximate" ? "about " : ""}${fmtDate(e.event_time)}`}${e.event_end_time ? ` to ${fmtTime(e.event_end_time)}` : ""}${e.time_basis === "inferred" ? " (inferred)" : ""}`;
      out.push(`## ${s.title}\n\n${tableMd(["Time", "What happened", "Label", "Evidence", "Sources"], t.timeline.map((e) => { const c = claims.get(e.claim_id); return [when(e), e.event_text, c.label, [c.why_it_supports, c.detail].filter(Boolean).join(" "), c.source_ids.map(src).join(", ")]; }))}`);
    } else if (s.type === "questions") {
      out.push(`## ${s.title}\n\n${tableMd(["Question", "Answer", "Label"], t.questions.map((q) => [q.question_text, q.answer_text || `Not answered yet. ${q.what_would_settle_it || ""}`, q.label || "Open"]))}`);
    } else if (s.type === "quotes") {
      out.push(`## ${s.title}\n\n${t.quotes.filter((q) => q.group === s.group).map((q) => `> ${q.quote_text}\n>\n> — ${q.speaker}${q.context ? `, ${q.context}` : ""} (${src(q.source_id)})`).join("\n\n")}`);
    } else if (s.type === "chart") {
      const chart = head.charts.find((c) => c.id === s.id);
      out.push(`## ${chart.title}\n\n${chart.alt}\n\n${tableMd([chart.x.label, ...chart.series.map((x) => x.label)], chartData[chart.id].map((r) => [chart.x.kind === "time" ? fmtDate(r[chart.x.column]) : r[chart.x.column], ...chart.series.map((x) => r[x.column])]))}\n\nData: [${chart.data}](../${dataPath}/${chart.data}). Source: ${chart.source_ids.map(src).join(", ")}.`);
    } else if (s.type === "image") {
      const image = head.images.find((i) => i.id === s.id);
      out.push(`## ${image.title}\n\n![${image.alt}](../${dataPath}/${image.file})\n\n${image.caption || ""} Image: ${image.credit}.`);
    } else if (s.type === "table") {
      const table = head.tables.find((x) => x.id === s.id);
      out.push(`## ${table.title}\n\n${table.intro ? `${table.intro}\n\n` : ""}${tableMd(table.columns.map((c) => c.label), tableData[table.id].map((r) => table.columns.map((c) => (c.type === "source" && r[c.name] ? src(r[c.name]) : r[c.name]))))}`);
    } else if (s.type === "note") {
      out.push(`## ${s.title}\n\n${readFileSync(join(loaded.dir, s.file), "utf8").trim()}`);
    }
  }
  out.push(`## Update log\n\n${tableMd(["When", "Update", "Type"], t.update_log.map((u) => [fmtDate(u.logged_at), `**${u.headline}** ${u.summary}`, CHANGES[u.change_type]]))}`);
  out.push(`## Sources\n\n${t.sources.map((s) => `- [${s.source_name}](${s.source_url}) (${TIERS[s.source_tier]}${s.source_date ? `, ${fmtDate(s.source_date)}` : ""})`).join("\n")}`);
  out.push(`## Data files\n\n${["incident.json", "claims.csv", "sources.csv", "timeline.csv", "questions.csv", ...(t.quotes.length ? ["quotes.csv"] : []), "update_log.csv"].map((f) => `- [${f}](../${dataPath}/${f})`).join("\n")}`);
  return out.join("\n\n") + "\n";
}
