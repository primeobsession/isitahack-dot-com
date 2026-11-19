// Renders one incident, loaded and checked by validate.mjs, as page HTML and as
// a Markdown export. Pure functions of the loaded data: no clock, no locale.
// Also holds the page layout that typed and hand-written incident pages share.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LABELS, esc, slugify, pill, inline, linkTag, fmtDate, fmtTime, fmtDay, timeTag, renderBody, tableHtml } from "./html.mjs";
import { renderChart, fmtNumber } from "./chart.mjs";

const TIERS = { 1: "Official source", 2: "News outlet", 3: "Researcher or analysis", 4: "Social post", 5: "Rumor source" };
const CHANGES = {
  added: "Added", updated: "Updated", label_change: "Label change", correction: "Correction",
  staleness_check: "Staleness check", checked_no_change: "Checked, no change", blocked_source: "Source blocked",
};
const STATUSES = { monitoring: "Monitoring", resolved: "Resolved", closed: "Closed" };
const STANDARD_NOTE = `<strong>Not verified: initial investigation only.</strong> Nothing on this page is absolutely confirmed. It is an early look based only on publicly available sources, and it should not be treated as verified fact. Even items labeled "Confirmed" only mean a public source reports them.`;
const two = (n) => String(n).padStart(2, "0");

// Everything other pages need to know about an incident, worked out from its data.
export function summarize({ head, t }) {
  const latest = t.update_log.find((r) => r.change_type !== "checked_no_change");
  const main = t.questions.find((q) => q.question_id === head.main_question_id);
  const tallyGroup = head.sections.find((s) => s.type === "claims")?.group;
  const inGroup = t.claims.filter((c) => c.group === tallyGroup);
  return {
    slug: head.slug, title: head.title, status: head.status, incident_date: head.incident_date, disclaimer: head.disclaimer,
    last_updated: latest.logged_at, last_checked: t.update_log[0].logged_at,
    latest: { at: latest.logged_at, headline: latest.headline, summary: latest.summary },
    question: { text: main.question_text, answer: main.answer_text, label: main.label, claim_ids: main.claim_ids },
    verdict: head.verdict || null, verdict_approved_at: head.verdict_approved_at || null,
    size: head.size,
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
<p><a href="${root}index.html#incidents">All incidents</a></p>
</section>`;

// The layout every incident page uses: a contents list that follows the reader,
// the report in the middle, and a side rail with the latest and other incidents.
// `toc` is [{ id, name, count }]; `lead`, `main` and `facts` are ready-made HTML.
export function incidentLayout({ root, slug, crumb, title, lead = "", toc, main, facts = "", others, repo, historyPath }) {
  const tocHtml = toc.map((s, i) => `<li><a href="#${esc(s.id)}"><span class="toc-n">${two(i + 1)}</span><span class="toc-name">${esc(s.name)}</span>${s.count !== undefined && s.count !== "" ? `<span class="count">${esc(s.count)}</span>` : ""}</a></li>`).join("\n");
  return `<main id="main" class="incident">
<div class="wrap page-grid">
<header class="page-head">
<p class="crumb">${crumb}</p>
<h1>${title}</h1>
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

const row = ({ id, lead, title, sub, trail = "", body, open = false }) => `<details class="row"${id ? ` id="${esc(id)}"` : ""}${open ? " open" : ""}>
<summary><span class="row-lead">${lead}</span><span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>${trail ? `<span class="row-trail">${trail}</span>` : ""}</summary>
<div class="row-body">
${body}
</div>
</details>`;

// Show the first `n` items; put the rest behind a native disclosure (no script needed).
function foldRest(items, n, noun) {
  if (items.length <= n) return items.join("\n");
  return `${items.slice(0, n).join("\n")}\n<details class="more">\n<summary>Show ${items.length - n} more ${noun}</summary>\n${items.slice(n).join("\n")}\n</details>`;
}

export function renderIncident(loaded, { root, dataHref, dir, repo, others }) {
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
  const claimBody = (c) => `${c.detail ? `<p>${inline(c.detail)}</p>\n` : ""}<p><span class="field">Why it supports</span> ${esc(c.why_it_supports)}</p>
<ul class="source-lines">
${c.source_ids.map(sourceLine).join("\n")}
</ul>${c.last_checked ? `\n<p class="meta">Last checked ${timeTag(c.last_checked)}</p>` : ""}`;

  // ---------- sections ----------
  const ids = new Map();
  const uniqueId = (text) => { const base = slugify(text); const n = (ids.get(base) || 0) + 1; ids.set(base, n); return n === 1 ? base : `${base}-${n}`; };
  for (const reserved of ["glance", "update-log", "sources", "main"]) ids.set(reserved, 1);
  const toc = [{ id: "glance", name: "At a glance" }];
  const fold = ({ title, count = "", open, body, id }) => {
    const sid = id || uniqueId(title);
    toc.push({ id: sid, name: title, count });
    return `<section class="block" id="${esc(sid)}">
<details class="fold"${open ? " open" : ""}>
<summary><span class="sec-n">${two(toc.length)}</span><h2>${esc(title)}</h2>${count !== "" ? `<span class="count">${esc(count)}</span>` : ""}</summary>
<div class="fold-body">
${body}
</div>
</details>
</section>`;
  };
  const intro = (s) => (s.intro ? `<p class="intro">${esc(s.intro)}</p>\n` : "");

  const renderers = {
    claims(s) {
      const list = t.claims.filter((c) => c.group === s.group);
      const rows = list.map((c) => row({ id: c.claim_id, lead: pill(c.label), title: esc(c.claim_text), sub: esc(c.summary), body: claimBody(c) }));
      return fold({ title: s.title, count: list.length, open: s.open, body: `${intro(s)}<div class="rows">\n${foldRest(rows, 8, "rows")}\n</div>` });
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
        return row({ id: e.event_id, lead: when, title: esc(e.event_text), trail: pill(c.label), body: `${repeats ? "" : `<p>${esc(c.summary)}</p>\n`}${basis}${claimBody(c)}` });
      });
      const zone = events.length ? fmtDate(events[0].event_time).split(" ").pop() : "";
      return fold({ title: s.title, count: events.length, open: s.open, body: `${intro(s)}<p class="meta">Times are ${zone === "ET" ? "Eastern" : esc(zone)}. Each row opens to show its evidence and source.</p>\n<div class="rows rows-timeline">\n${foldRest(rows, 8, "events")}\n</div>` });
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
      return fold({ title: s.title, count: rows.length, open: s.open, body: `${intro(s)}<div class="rows">\n${foldRest(rows, 8, "questions")}\n</div>` });
    },
    quotes(s) {
      const list = t.quotes.filter((q) => q.group === s.group);
      const items = list.map((q) => {
        const bits = [esc(q.speaker), q.context ? esc(q.context) : "", q.said_at ? esc(fmtDate(q.said_at)) : "", sourceLink(q.source_id), q.confidence ? `confidence: ${esc(q.confidence)}` : ""].filter(Boolean);
        return `<figure class="quote" id="${esc(q.quote_id)}">\n<blockquote><p>${esc(q.quote_text)}</p></blockquote>\n<figcaption>${bits.join(" · ")}${q.notes ? `<br>${esc(q.notes)}` : ""}</figcaption>\n</figure>`;
      });
      return fold({ title: s.title, count: list.length, open: s.open, body: `${intro(s)}${foldRest(items, 6, "statements")}` });
    },
    chart(s) {
      const chart = head.charts.find((c) => c.id === s.id);
      const rows = chartData[chart.id];
      const headRow = [chart.x.label, ...chart.series.map((x) => x.label)];
      const body = rows.map((r) => [esc(chart.x.kind === "time" ? fmtDate(r[chart.x.column]) : r[chart.x.column]), ...chart.series.map((x) => (r[x.column] === "" ? "" : esc(fmtNumber(Number(r[x.column])))))]);
      return fold({ title: chart.title, open: s.open, id: uniqueId(chart.id), body: `<figure class="figure">
${renderChart(chart, rows)}
<figcaption>${chart.caption ? `${esc(chart.caption)} ` : ""}Source: ${chart.source_ids.map(sourceLink).join(", ")}.</figcaption>
</figure>
<details class="more">
<summary>Show the numbers</summary>
${tableHtml(headRow, body)}
</details>` });
    },
    image(s) {
      const image = head.images.find((i) => i.id === s.id);
      const credit = `${esc(image.credit)}${image.source_id ? `, via ${sourceLink(image.source_id)}` : ""}`;
      return fold({ title: image.title, open: s.open, id: uniqueId(image.id), body: `<figure class="figure">
<img src="${esc(`${dataHref}/${image.file}`)}" width="${image.width}" height="${image.height}" alt="${esc(image.alt)}" loading="lazy">
<figcaption>${image.caption ? `${esc(image.caption)} ` : ""}Image: ${credit}.</figcaption>
</figure>` });
    },
    table(s) {
      const table = head.tables.find((x) => x.id === s.id);
      const cell = (c, v) => (v == null ? "" : c.type === "label" ? pill(v) : c.type === "source" ? sourceLink(v) : c.type === "number" ? esc(fmtNumber(v)) : inline(String(v)));
      const body = tableData[table.id].map((r) => table.columns.map((c) => cell(c, r[c.name])));
      return fold({ title: table.title, count: body.length, open: s.open, id: uniqueId(table.id), body: `${table.intro ? `<p class="intro">${esc(table.intro)}</p>\n` : ""}${tableHtml(table.columns.map((c) => c.label), body)}` });
    },
    note(s) {
      const doc = renderBody(readFileSync(join(dir, s.file), "utf8"));
      const blocks = [...doc.pre, ...doc.sections.flatMap((x) => [`<h3>${inline(x.heading)}</h3>`, ...x.blocks])];
      return fold({ title: s.title, open: s.open, body: `<div class="prose">\n${blocks.join("\n")}\n</div>` });
    },
  };
  const sectionsHtml = head.sections.map((s) => renderers[s.type](s)).join("\n\n");

  const logRows = t.update_log.map((u) => `<li class="log-row${u.change_type === "checked_no_change" ? " quiet" : ""}" id="${esc(u.log_id)}">
<span class="log-when">${timeTag(u.logged_at)}</span>
<span class="log-what"><strong>${esc(u.headline)}</strong> ${esc(u.summary)} <span class="meta">${esc(CHANGES[u.change_type])} · ${esc(u.author)}</span></span>
</li>`);
  const logHtml = fold({ title: "Update log", count: t.update_log.length, id: "update-log", body: `<p class="meta">Every check and change, newest first.</p>\n<ol class="log">\n${foldRest(logRows, 6, "entries")}\n</ol>` });
  const sourcesHtml = fold({ title: "Sources", count: t.sources.length, id: "sources", body: `<ol class="source-lines numbered">\n${t.sources.map((s) => sourceLine(s.source_id)).join("\n")}\n</ol>` });

  // ---------- the top of the page ----------
  const q = sum.question;
  const verdictNote = sum.verdict
    ? `<p class="verdict"><span class="verdict-badge">${esc(sum.verdict)}</span> Final verdict, approved by the site's owner on ${timeTag(sum.verdict_approved_at, fmtDay(sum.verdict_approved_at))}.</p>`
    : `<p class="answer-note">This is the current answer, not a final verdict. A final verdict is published only after the site's owner has reviewed the evidence.</p>`;
  const lead = `<section class="answer-box" aria-labelledby="the-question">
<p class="kicker">The short answer</p>
<div class="answer-head"><h2 id="the-question">${esc(q.text)}</h2>${pill(q.label)}</div>
<p class="answer">${esc(q.answer)}</p>
<p class="answer-refs"><span class="field">Rests on</span> ${q.claim_ids.map((id) => `<a href="${esc(claimHref(id))}">${esc(claims.get(id).claim_text)}</a>`).join(" · ")}</p>
${verdictNote}
</section>`;
  const tiles = (head.figures || []).map((f) => `<li class="tile"><a href="${esc(claimHref(f.claim_id))}"><span class="tile-value">${esc(f.value)}</span><span class="tile-label">${esc(f.label)}</span>${f.detail ? `<span class="tile-detail">${esc(f.detail)}</span>` : ""}</a></li>`).join("\n");
  const known = head.known.map((k) => `<li>${esc(k.text)} <a class="ref" href="${esc(claimHref(k.claim_id))}">evidence</a></li>`).join("\n");
  const notKnown = head.not_known.map((k) => `<li>${esc(k.text)}${k.question_id ? ` <a class="ref" href="#${esc(k.question_id)}">open question</a>` : ""}</li>`).join("\n");

  const facts = `<section class="side-block latest">
<p class="kicker accent">The latest · ${timeTag(sum.latest.at)}</p>
<p class="latest-headline">${esc(sum.latest.headline)}</p>
<p class="latest-summary">${esc(sum.latest.summary)}</p>
<p><a href="#update-log">All ${t.update_log.length} updates</a></p>
</section>
<section class="side-block">
<dl class="reach">
<div><dt>Size</dt><dd><strong>${esc(head.size)}.</strong> ${esc(head.size_basis)}</dd></div>
<div><dt>Who is affected</dt><dd>${esc(head.who_is_affected)}</dd></div>
</dl>
</section>
<section class="side-block">
${evidenceBar(sum.tally, sum.tally_title)}
</section>`;

  const main = `<aside class="note">
<p>${STANDARD_NOTE}</p>
<p>${esc(head.disclaimer)}</p>
</aside>
<section class="block" id="glance">
<div class="block-head"><span class="sec-n">01</span><h2>At a glance</h2></div>
${tiles ? `<ul class="tiles">\n${tiles}\n</ul>` : ""}
<div class="known-grid">
<div class="known"><h3>Known so far</h3>${known ? `<ul>\n${known}\n</ul>` : `<p>Nothing is established yet.</p>`}</div>
<div class="not-known"><h3>Not known yet</h3>${notKnown ? `<ul>\n${notKnown}\n</ul>` : `<p>No open questions are recorded.</p>`}</div>
</div>
</section>

${sectionsHtml}

${logHtml}

${sourcesHtml}`;

  const html = incidentLayout({
    root, slug: head.slug, repo, others, toc, lead, main, facts,
    crumb: `<a href="${root}index.html">Incidents</a> / Incident date ${timeTag(head.incident_date)}`,
    title: esc(head.title), historyPath: `data/incidents/${head.slug}`,
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
  out.push(`---\nslug: ${head.slug}\ntitle: ${JSON.stringify(head.title)}\nstatus: ${head.status}\nincident_date: ${head.incident_date}\nlast_updated: ${sum.last_updated}\nsize: ${JSON.stringify(head.size)}\ndata_dir: ${dataPath}\ngenerated: true\ndisclaimer: ${JSON.stringify(head.disclaimer)}\n---`);
  out.push(`<!-- Generated by scripts/build.mjs from ${dataPath}/. Do not edit this file; edit the data. -->`);
  out.push(`# ${head.title}`);
  out.push(`> **Not verified: initial investigation only.** Nothing on this page is absolutely confirmed. It is an early look based only on publicly available sources, and it should not be treated as verified fact. Even items labeled "Confirmed" only mean a public source reports them. ${head.disclaimer}`);
  out.push(`## ${sum.question.text}\n\n**${sum.question.label}.** ${sum.question.answer}`);
  out.push(sum.verdict ? `Final verdict: **${sum.verdict}**, approved by the site's owner on ${fmtDay(sum.verdict_approved_at)}.` : `This is the current answer, not a final verdict.`);
  out.push(`## The latest\n\n${fmtDate(sum.latest.at)}: **${sum.latest.headline}** ${sum.latest.summary}`);
  out.push(`## At a glance\n\n- Status: ${head.status}\n- Size: ${head.size}. ${head.size_basis}\n- Who is affected: ${head.who_is_affected}`);
  if (head.figures?.length) out.push(tableMd(["Value", "What", "Detail"], head.figures.map((f) => [f.value, f.label, f.detail || ""])));
  out.push(`### Known so far\n\n${head.known.map((k) => `- ${k.text}`).join("\n") || "- Nothing is established yet."}`);
  out.push(`### Not known yet\n\n${head.not_known.map((k) => `- ${k.text}`).join("\n") || "- No open questions are recorded."}`);
  for (const s of head.sections) {
    if (s.type === "claims") {
      const list = t.claims.filter((c) => c.group === s.group);
      out.push(`## ${s.title}\n\n${tableMd(["Claim", "Label", "What we know", "Why it supports", "Sources"], list.map((c) => [c.claim_text, c.label, [c.summary, c.detail].filter(Boolean).join(" "), c.why_it_supports, c.source_ids.map(src).join(", ")]))}`);
    } else if (s.type === "timeline") {
      const when = (e) => `${e.time_text ? `${fmtDay(e.event_time)}, ${e.time_text}` : `${e.time_basis === "approximate" ? "about " : ""}${fmtDate(e.event_time)}`}${e.event_end_time ? ` to ${fmtTime(e.event_end_time)}` : ""}${e.time_basis === "inferred" ? " (inferred)" : ""}`;
      out.push(`## ${s.title}\n\n${tableMd(["Time", "What happened", "Label", "Evidence", "Sources"], t.timeline.map((e) => { const c = claims.get(e.claim_id); return [when(e), e.event_text, c.label, c.detail || c.why_it_supports, c.source_ids.map(src).join(", ")]; }))}`);
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
