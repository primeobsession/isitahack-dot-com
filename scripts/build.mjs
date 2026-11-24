#!/usr/bin/env node
// isitahack.com static build. Plain Node, zero dependencies.
//
//   node scripts/build.mjs                       build the site in place
//   node scripts/build.mjs --out _preview        build a copy into a folder
//   node scripts/build.mjs --out _preview --sample   ...including the made-up sample incident
//
// Incidents come from two places:
//   data/incidents/<slug>/incident.json  the typed format (format/README.md). It is checked by
//                                        scripts/validate.mjs first; any problem stops the build.
//                                        The build writes incidents/<slug>.html and <slug>.md.
//   incidents/<slug>.md                  a hand-written page, for incidents not yet converted.
// It also writes index.html, how-it-works.html and about.html from pages/*.html, 404.html and
// sitemap.xml, and updates index.json. Output depends only on the input files: no clock, no locale, no randomness, so
// the same input always produces byte-identical output.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LABELS, esc, slugify, pill, inline, linkTag, fmtDate, timeTag, renderBody, warnings, warn, setCurrent } from "./html.mjs";
import { loadIncident } from "./validate.mjs";
import { renderIncident, incidentMarkdown, incidentLayout, incidentPicture, evidenceBar, summarize } from "./incident.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SITE = {
  name: "isitahack.com",
  // The name search engines should show for the site, and the address every page is published at.
  title: "Is It a Hack?",
  url: "https://isitahack.com",
  card: { path: "assets/social-card.png", width: 1200, height: 630, alt: "Is it a hack? Public-source fact-checks of security news, with every claim labelled and linked to its source." },
  logo: "assets/logo.png",
  xHandle: "@isitahack",
  tagline:
    "Public-source fact-checks of security news. Each incident carries a label (Confirmed, Reported, Unverified, Rumor, Debunked, Not established), source links, and a dated update log.",
  footer: "Made for entertainment using AI. Not endorsed by anyone named here.",
  repo: "https://github.com/primeobsession/isitahack-dot-com",
  x: "https://x.com/isitahack",
};
const STATUSES = { monitoring: "Monitoring", resolved: "Resolved", closed: "Closed" };
const PAGES = [
  { file: "how-it-works", title: "How it works", description: "Who does what at isitahack.com: the AI agents, the rulebook they work to, the six labels, and the one call a person makes." },
  { file: "about", title: "About", description: "Why isitahack.com exists, who is behind it, and how to get in touch." },
];

// ---------- front-matter of hand-written pages (small YAML subset: scalars and one level of maps) ----------
function parseScalar(v, file) {
  v = v.trim();
  if (v.startsWith('"')) {
    try { return JSON.parse(v); } catch { throw new Error(`${file}: bad quoted value ${v}`); }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}
export function parseFrontMatter(src, file) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`${file}: missing front-matter`);
  const fm = {};
  let current = null;
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const nested = line.match(/^\s+([^:]+):\s*(.*)$/);
    const top = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (top) {
      if (top[2] === "") { fm[top[1]] = current = {}; }
      else { fm[top[1]] = parseScalar(top[2], file); current = null; }
    } else if (nested && current) {
      current[nested[1].trim()] = parseScalar(nested[2], file);
    } else {
      throw new Error(`${file}: unsupported front-matter line: ${line}`);
    }
  }
  return { fm, body: src.slice(m[0].length) };
}

// ---------- page shell ----------
// Shared <head> partial (Google Tag Manager, requested by Justin). Inserted
// verbatim into every generated page; edit it in one place.
const HEAD_PARTIAL = readFileSync(join(ROOT, "scripts", "partials", "head.html"), "utf8").replace(/\n+$/, "");
const MARK = `<svg class="mark" aria-hidden="true" width="32" height="32" viewBox="0 0 28 28" fill="none"><path d="M14 3 A11 11 0 0 1 14 25" stroke-width="2.6" stroke-linecap="round"/><path d="M14 25 A11 11 0 0 1 14 3" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 4.2"/><text x="14" y="19.4" text-anchor="middle" font-weight="800" font-size="15">?</text></svg>`;
const WORDMARK = `<span class="wordmark"><span>isita</span><b>hack</b><span class="tld">.com</span></span>`;
// The stored theme is applied before first paint; the rest is wired up at the end of the body.
const THEME_INIT = `<script>try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>`;
// Optional enhancements: the theme toggle, opening a collapsed row a link points at,
// and marking the section being read in the contents list.
const ENHANCE = `<script>(function(){var r=document.documentElement,b=document.querySelector(".theme-toggle");function cur(){return r.dataset.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}function paint(){var d=cur()==="dark";b.setAttribute("aria-label",d?"Switch to light theme":"Switch to dark theme");b.setAttribute("aria-pressed",d?"true":"false")}if(b){b.hidden=false;paint();b.addEventListener("click",function(){var n=cur()==="dark"?"light":"dark";r.dataset.theme=n;try{localStorage.setItem("theme",n)}catch(e){}paint()})}function reveal(){var id=decodeURIComponent(location.hash.slice(1));var el=id&&document.getElementById(id);if(!el)return;for(var p=el;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;el.scrollIntoView()}addEventListener("hashchange",reveal);reveal();var links=[].slice.call(document.querySelectorAll(".toc a"));if(links.length&&"IntersectionObserver"in window){var seen={};var io=new IntersectionObserver(function(es){es.forEach(function(e){seen[e.target.id]=e.isIntersecting});var on=null;links.forEach(function(a){var id=a.getAttribute("href").slice(1);if(!on&&seen[id])on=a});if(on)links.forEach(function(a){if(a===on)a.setAttribute("aria-current","true");else a.removeAttribute("aria-current")})},{rootMargin:"-10% 0px -60% 0px"});links.forEach(function(a){var s=document.getElementById(a.getAttribute("href").slice(1));if(s)io.observe(s)})}})();</script>`;

// Structured data for search engines. It only restates what the page shows.
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const ORG = { "@type": "Organization", "@id": `${SITE.url}/#org`, name: SITE.title, alternateName: SITE.name, url: `${SITE.url}/`, logo: `${SITE.url}/${SITE.logo}`, sameAs: [SITE.x, SITE.repo] };

// `path` is the page's address on the site ("" for the home page); `share` is the
// title to show when the page is shared, without the site name.
function shell({ title, share = title, description, root, path, body, banner = "", current = "", disclaimer = SITE.footer, markdown = "", article = null, data = [], noindex = false, card = null }) {
  const home = root || "./";
  const url = `${SITE.url}/${path}`;
  const shareImage = card || { url: `${SITE.url}/${SITE.card.path}`, width: SITE.card.width, height: SITE.card.height, alt: SITE.card.alt };
  const meta = noindex ? `<meta name="robots" content="noindex">` : [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(SITE.title)}">`,
    `<meta property="og:type" content="${article ? "article" : "website"}">`,
    `<meta property="og:title" content="${esc(share)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(shareImage.url)}">`,
    `<meta property="og:image:width" content="${shareImage.width}">`,
    `<meta property="og:image:height" content="${shareImage.height}">`,
    `<meta property="og:image:alt" content="${esc(shareImage.alt)}">`,
    article ? `<meta property="article:published_time" content="${esc(article.published)}">\n<meta property="article:modified_time" content="${esc(article.modified)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="${SITE.xHandle}">`,
    ...data.map(jsonLd),
  ].filter(Boolean).join("\n");
  const nav = [
    ["incidents", `${home}#incidents`, "Incidents"],
    ["how-it-works", `${root}how-it-works.html`, "How it works"],
    ["about", `${root}about.html`, "About"],
  ].map(([key, href, text]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ""}>${text}</a>`).join("\n");
  // Tell programs and AI assistants where the plain-text versions are.
  const alternates = `${markdown ? `<link rel="alternate" type="text/markdown" href="${esc(markdown)}" title="This report as Markdown">\n` : ""}<link rel="alternate" type="application/json" href="${root}index.json" title="All incidents as JSON">`;
  const agentNote = markdown
    ? `<!-- AI assistants and other programs: this report is also available as plain Markdown at ${esc(markdown)} (same folder). ${root}llms.txt maps the whole site. -->`
    : `<!-- AI assistants and other programs: ${root}llms.txt maps this site, and ${root}index.json lists every incident with its Markdown version. -->`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${HEAD_PARTIAL}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${meta}
${alternates}
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/site.css">
${THEME_INIT}
</head>
<body>
${agentNote}
<a class="skip" href="#main">Skip to content</a>
${banner}
<header class="site-header wrap">
<a class="brand" href="${home}">${MARK}${WORDMARK}</a>
<nav class="site-nav" aria-label="Main">
${nav}
<a href="${SITE.repo}" rel="noopener">GitHub</a>
</nav>
<button class="theme-toggle" type="button" hidden aria-label="Switch to dark theme"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 1.900a7.100 7.100 0 0 1 0 14.200z" fill="currentColor"/></svg></button>
</header>
${body}
<footer class="site-footer">
<div class="wrap footer-grid">
<div>
${WORDMARK}
<p class="disclaimer-short">${esc(disclaimer)}</p>
<p class="meta">Researched and organized by AI agents from public sources. Not security, legal, financial or safety advice.</p>
</div>
<nav class="footer-nav" aria-label="Footer">
<a href="${home}#incidents">Incidents</a>
<a href="${root}how-it-works.html">How it works</a>
<a href="${root}about.html">About</a>
<a href="${SITE.repo}" rel="noopener">GitHub repository</a>
<a href="${SITE.x}" rel="noopener">isitahack on X</a>
<a href="${root}about.html#contact">Report an error</a>
<a class="mono" href="${root}index.json">index.json</a>
<a class="mono" href="${root}llms.txt">llms.txt</a>
</nav>
</div>
</footer>
${ENHANCE}
</body>
</html>
`;
}

function statusBanner({ status, last_updated, last_checked }, lead) {
  const name = STATUSES[status] || String(status || "Unknown");
  const checked = last_checked && last_checked !== last_updated ? `<span>Last checked ${timeTag(last_checked)}</span>` : "";
  const open = status === "monitoring" && !lead ? `<span>Coverage is not final</span>` : "";
  return `<div class="status-banner status-${esc(slugify(String(status || "unknown")))}" role="status">
<div class="wrap"><strong><span class="status-dot" aria-hidden="true"></span>${esc(lead || name)}</strong><span>Last updated ${timeTag(last_updated)}</span>${checked}${open}</div>
</div>`;
}

// ---------- incidents ----------
// Loading comes first for every incident, so each page can list the others.
function loadTyped(dir) {
  const loaded = loadIncident(dir);
  if (loaded.errs.length) {
    console.error(`FAIL ${dir} (${loaded.errs.length} problem${loaded.errs.length === 1 ? "" : "s"})`);
    for (const e of loaded.errs) console.error(`  ${e}`);
    return null;
  }
  loaded.dir = dir;
  const sum = summarize(loaded);
  const dataPath = `data/incidents/${sum.slug}`;
  const first = loaded.t.claims.find((c) => c.claim_id === sum.question.claim_ids[0]);
  const source = loaded.t.sources.find((s) => s.source_id === first.source_ids[0]);
  return { ...sum, typed: true, loaded, dataPath, anatomy: { claim: first, source }, files: { page: `incidents/${sum.slug}.md`, html: `incidents/${sum.slug}.html`, data: `${dataPath}/` } };
}
function writeTyped(i, others, out) {
  const { main } = renderIncident(i.loaded, { root: "../", dataHref: `../${i.dataPath}`, dir: i.loaded.dir, repo: SITE.repo, others });
  // The page title is the question people ask, then the site name.
  const path = `incidents/${i.slug}.html`, url = `${SITE.url}/${path}`;
  const description = `${i.question.text} ${i.question.answer}`;
  // A photograph, when the incident has one, is also what a shared link shows.
  const photo = incidentPicture(i.loaded.head, i.dataPath).image;
  const card = photo ? { url: `${SITE.url}/${i.dataPath}/${photo.file}`, width: photo.width, height: photo.height, alt: photo.alt } : null;
  const data = [{
    "@context": "https://schema.org", "@type": "Article", "@id": `${url}#article`,
    headline: i.question.text, alternativeHeadline: i.title, description, abstract: i.question.answer,
    url, mainEntityOfPage: url, inLanguage: "en", isAccessibleForFree: true,
    datePublished: i.first_published, dateModified: i.last_updated,
    image: [card ? card.url : `${SITE.url}/${SITE.card.path}`],
    // The incident is a plain "Thing": schema.org's "Event" means a concert or a conference to a
    // search engine, which then asks for a venue, tickets and a performer.
    about: { "@type": "Thing", name: i.title }, temporalCoverage: i.incident_date,
    author: { "@type": "Organization", name: `${SITE.name} desk`, url: `${SITE.url}/how-it-works.html` },
    publisher: ORG,
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE.title, item: `${SITE.url}/` },
      { "@type": "ListItem", position: 2, name: i.title, item: url },
    ],
  }];
  writeFileSync(join(out, "incidents", `${i.slug}.html`), shell({
    title: `${i.question.text} | ${SITE.title}`, share: i.question.text, description, path, data, card,
    article: { published: i.first_published, modified: i.last_updated },
    root: "../", banner: statusBanner(i), body: main, disclaimer: i.disclaimer, markdown: `${i.slug}.md`,
  }));
  writeFileSync(join(out, "incidents", `${i.slug}.md`), incidentMarkdown(i.loaded, { dataPath: i.dataPath }));
  if (resolve(join(out, i.dataPath)) !== resolve(i.loaded.dir)) cpSync(i.loaded.dir, join(out, i.dataPath), { recursive: true });
}

// A hand-written page. Its front-matter may carry the short answer and the latest
// (question, answer, answer_label, latest) so the page can lead with them.
function loadLegacy(file) {
  const name = basename(file);
  const src = readFileSync(file, "utf8");
  const { fm, body } = parseFrontMatter(src, name);
  const slug = basename(file, ".md");
  if (fm.slug !== slug) throw new Error(`${name}: front-matter slug "${fm.slug}" does not match filename`);
  for (const k of ["title", "status", "last_updated", "disclaimer"]) if (!fm[k]) throw new Error(`${name}: front-matter missing ${k}`);
  if (fm.labels_summary) for (const k of Object.keys(fm.labels_summary)) if (!LABELS.includes(k)) throw new Error(`${name}: unknown label ${k}`);
  if (fm.answer_label && !LABELS.includes(fm.answer_label)) throw new Error(`${name}: unknown answer_label ${fm.answer_label}`);
  const question = fm.question && fm.answer && fm.answer_label ? { text: fm.question, answer: fm.answer, label: fm.answer_label } : null;
  return {
    slug, typed: false, name, src, fm, body, question, latestLine: fm.latest || null,
    title: fm.title, status: fm.status, incident_date: fm.incident_date, last_updated: fm.last_updated, disclaimer: fm.disclaimer,
    tally: fm.labels_summary || null, tally_title: fm.labels_summary_title || "Leading theories",
    files: { page: `incidents/${slug}.md`, html: `incidents/${slug}.html` },
  };
}
function writeLegacy(i, others, out) {
  setCurrent(i.name);
  const doc = renderBody(i.body);
  const lu = i.body.match(/Last updated ([^.;]*?\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4})/);
  if (lu && !fmtDate(String(i.last_updated).slice(0, 10)).startsWith(lu[1].match(/[A-Z][a-z]{2}[a-z]* \d{1,2}/)[0].replace(/^(\w{3})\w*/, "$1")))
    warn(i.name, `body says "Last updated ${lu[1]}" but front-matter last_updated is ${i.last_updated}`);

  const two = (n) => String(n).padStart(2, "0");
  const sectionsHtml = doc.sections
    .map((s, n) => `<section id="${esc(s.id)}" class="section section-${esc(s.id)}">\n<div class="block-head"><span class="sec-n">${two(n + 1)}</span><h2>${inline(s.heading)}</h2></div>\n${s.blocks.join("\n")}\n</section>`)
    .join("\n\n");
  const lead = i.question
    ? `<section class="answer-box" aria-labelledby="the-question">
<p class="kicker">The short answer</p>
<div class="answer-head"><h2 id="the-question">${esc(i.question.text)}</h2>${pill(i.question.label)}</div>
<p class="answer">${esc(i.question.answer)}</p>
<p class="answer-note">This is the current answer, not a final verdict. A final verdict is published only after the site's owner has reviewed the evidence.</p>
</section>`
    : "";
  const facts = [
    i.latestLine ? `<section class="side-block latest">\n<p class="kicker accent">The latest · ${timeTag(i.last_updated)}</p>\n<p class="latest-headline">${esc(i.latestLine)}</p>\n${doc.sections.some((s) => s.id === "update-log") ? `<p><a href="#update-log">Full update log</a></p>` : ""}\n</section>` : "",
    i.tally ? `<section class="side-block">\n${evidenceBar(i.tally, i.tally_title)}\n</section>` : "",
  ].filter(Boolean).join("\n");
  const body = incidentLayout({
    root: "../", slug: i.slug, repo: SITE.repo, others, lead, facts,
    toc: doc.sections.map((s) => ({ id: s.id, name: s.heading.replace(/\*\*|`/g, "") })),
    main: `${doc.pre.join("\n")}\n\n${sectionsHtml}`,
    crumb: `<a href="../#incidents">Incidents</a>${i.incident_date ? ` / Incident date ${timeTag(i.incident_date)}` : ""}`,
    title: inline(doc.title || i.title), historyPath: `incidents/${i.slug}.md`,
  });
  writeFileSync(join(out, "incidents", `${i.slug}.html`), shell({
    title: `${i.title} | ${SITE.title}`, share: i.title, description: i.question ? `${i.question.text} ${i.question.answer}` : i.disclaimer,
    path: `incidents/${i.slug}.html`, root: "../", banner: statusBanner(i), disclaimer: i.disclaimer, body, markdown: `${i.slug}.md`,
  }));
  if (resolve(out) !== resolve(ROOT)) writeFileSync(join(out, "incidents", `${i.slug}.md`), i.src);
}

// ---------- home and the static pages ----------
// The home page files every incident under one of four plain answers (format/README.md,
// "The home page's four answers"). The wording stays clear of the two final verdicts,
// which only the owner gives.
const ANSWER_GROUPS = [
  { key: "unclear", title: "Still unclear", short: "Still unclear", pill: "pill-not-established", means: "Nobody has shown whether it was an attack or not.", gloss: "Open questions. Nobody has shown whether these were attacks, and we keep checking." },
  { key: "hack-stated", title: "Hacked, by its own account", short: "Says it was hacked", pill: "pill-confirmed", means: "The organization itself, or an official source, says someone got in.", gloss: "The organization itself, or an official source, says someone got in. Who did it is often still unknown." },
  { key: "hack-reported", title: "Reported as a hack", short: "Reported as a hack", pill: "pill-reported", means: "News outlets say it was a hack. It is not officially confirmed.", gloss: "News outlets or a single official say it was a hack. Nothing independent confirms it yet." },
  { key: "no-sign-of-hack", title: "No sign of a hack", short: "No sign of a hack", pill: "pill-no-sign", means: "The organization says it was not an attack, or the claim was shown to be false.", gloss: "The organization says it was not an attack, or the claim of one was shown to be false. Some rest on the company's word alone." },
];
const INCIDENT_TYPES = [["outage", "Outages"], ["breach", "Data breaches"], ["attack", "Attacks"]];
const answerPill = (g) => `<span class="pill ${g.pill}">${esc(g.short)}</span>`;
// A row shows the day in its own column, so a date at the end of the title is dropped.
const TITLE_DATE = /,\s*(?:reported\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{1,2}(?:\s*(?:to|-|–)\s*\d{1,2})?)?,?\s+\d{4}$/;
const rowName = (i) => i.title.replace(TITLE_DATE, "");
// "Nov 13", with the year only when it is not the newest incident's year.
const rowDay = (iso, year) => { const full = fmtDate(String(iso).slice(0, 10)); return full.endsWith(`, ${year}`) ? full.slice(0, -6) : full; };
// One incident on the home page: its name, the day it happened and the answer so far.
function incidentRow(i, year) {
  const href = `incidents/${esc(i.slug)}.html`;
  const words = [i.title, i.subject?.name, i.question?.text, ...(i.also_names || [])].filter(Boolean).join(" ").toLowerCase();
  const when = i.incident_date ? `<time class="irow-when" datetime="${esc(i.incident_date)}">${esc(rowDay(i.incident_date, year))}</time>` : "";
  const verdict = i.verdict ? `<span class="irow-verdict"><span class="verdict-badge">${esc(i.verdict)}</span> Final verdict.</span>` : "";
  const answer = i.question ? `<span class="irow-answer">${esc(i.question.answer)}</span>` : i.latestLine ? `<span class="irow-answer">${esc(i.latestLine)}</span>` : "";
  return `<li class="irow" data-type="${esc(i.incident_type || "")}" data-text="${esc(words)}"><a href="${href}"><span class="irow-top"><span class="irow-name">${esc(rowName(i))}</span>${when}</span>${verdict}${answer}</a></li>`;
}
function anatomyCard(i) {
  const { claim, source } = i.anatomy;
  return `<aside class="anatomy" aria-label="Anatomy of a claim">
<p class="kicker split"><span>Anatomy of a claim</span><span>From: ${esc(i.title)}</span></p>
<dl class="anatomy-card">
<div><dt>Claim</dt><dd class="anatomy-claim">${esc(claim.claim_text)}</dd></div>
<div><dt>Label</dt><dd>${pill(claim.label)}</dd></div>
<div><dt>What we know</dt><dd>${esc(claim.summary)}</dd></div>
<div><dt>Why the source supports it</dt><dd>${esc(claim.why_it_supports)}</dd></div>
<div><dt>Source</dt><dd>${linkTag(source.source_url, esc(source.source_name))}</dd></div>
<div class="anatomy-foot"><dd>Last checked ${timeTag(claim.last_checked)}</dd></div>
</dl>
<p class="meta">Every row on every page has these parts. A claim without a source does not get published.</p>
</aside>`;
}
const fill = (html, map) => html.replace(/\{\{(\w+)\}\}/g, (whole, key) => (key in map ? map[key] : whole));
const readPage = (name) => readFileSync(join(ROOT, "pages", `${name}.html`), "utf8");
const pillMap = Object.fromEntries(LABELS.map((l) => [`pill_${slugify(l).replace(/-/g, "_")}`, pill(l)]));

function buildHome(incidents, out) {
  const monitoring = incidents.filter((i) => i.status === "monitoring");
  const latest = incidents[0];
  const typed = incidents.find((i) => i.typed);
  const banner = latest
    ? statusBanner({ status: monitoring.length ? "monitoring" : "resolved", last_updated: latest.last_updated },
        monitoring.length ? `Monitoring ${monitoring.length} incident${monitoring.length === 1 ? "" : "s"}` : "No incidents being monitored")
    : "";
  // Within a group the incident that happened most recently comes first.
  const byDay = [...incidents].sort((a, b) => String(b.incident_date || "").localeCompare(String(a.incident_date || "")) || String(b.last_updated).localeCompare(String(a.last_updated)) || a.slug.localeCompare(b.slug));
  const year = String(byDay[0]?.incident_date || "").slice(0, 4);
  const groups = ANSWER_GROUPS.map((g) => {
    const rows = byDay.filter((i) => (i.answer_group || "unclear") === g.key);
    return `<section class="group" id="${g.key}" data-group aria-labelledby="g-${g.key}">
<div class="group-head">
<span class="group-n" data-count>${rows.length}</span>
<h3 id="g-${g.key}">${esc(g.title)}</h3>
${answerPill(g)}
<p class="meta">${esc(g.gloss)}</p>
</div>
<div class="group-body">
<ul class="group-rows">
${rows.map((i) => incidentRow(i, year)).join("\n")}
</ul>
</div>
</section>`;
  }).join("\n");
  const chip = (type, text, n, on) => `<button type="button" class="pick" data-type="${type}" aria-pressed="${on ? "true" : "false"}">${text} <span class="n">${n}</span></button>`;
  const filters = [chip("all", "All", incidents.length, true), ...INCIDENT_TYPES.map(([type, text]) => chip(type, text, incidents.filter((i) => i.incident_type === type).length))].join("\n");
  const body = fill(readPage("home"), {
    root: "", repo: SITE.repo, x: SITE.x, ...pillMap,
    latest: latest ? `incidents/${esc(latest.slug)}.html` : "#incidents",
    anatomy: typed ? anatomyCard(typed) : "",
    now: latest ? `${incidents.length} incident${incidents.length === 1 ? "" : "s"}, grouped by the answer so far. Each date is the day the incident happened.` : "No incidents are being tracked yet.",
    newest: byDay.slice(0, 4).map((i) => `<a href="incidents/${esc(i.slug)}.html">${esc(rowName(i))}</a>`).join(", "),
    answer_key: ANSWER_GROUPS.map((g) => `<div><dt>${answerPill(g)}</dt><dd>${esc(g.means)}</dd></div>`).join("\n"),
    filters, groups,
  });
  const data = [
    { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE.url}/#site`, name: SITE.title, alternateName: ["isitahack", SITE.name], url: `${SITE.url}/`, description: SITE.tagline, publisher: { "@id": ORG["@id"] } },
    { "@context": "https://schema.org", ...ORG },
  ];
  writeFileSync(join(out, "index.html"), shell({ title: `${SITE.title} Public-source fact-checks of security news`, share: `${SITE.title} Here is what is actually known.`, description: `Is it a hack? ${SITE.tagline}`, root: "", path: "", data, banner, body, current: "incidents" }));
}
function buildPages(out) {
  for (const page of PAGES) {
    const body = fill(readPage(page.file), { root: "", repo: SITE.repo, x: SITE.x, ...pillMap });
    writeFileSync(join(out, `${page.file}.html`), shell({ title: `${page.title} | ${SITE.title}`, share: page.title, description: page.description, root: "", path: `${page.file}.html`, body, current: page.file }));
  }
  // GitHub Pages serves 404.html for any address that does not exist, at any depth,
  // so its links start from the site root.
  writeFileSync(join(out, "404.html"), shell({
    title: `Page not found | ${SITE.title}`, description: "This page does not exist.", root: "/", path: "404.html", noindex: true,
    body: `<main id="main" class="doc">\n<section class="wrap doc-head">\n<p class="kicker accent">Page not found</p>\n<h1>There is nothing at this address.</h1>\n<p class="lede">It may have moved, or the link may be wrong.</p>\n<p class="actions"><a class="button" href="/#incidents">See all incidents</a> <a class="button secondary" href="/about.html#contact">Report a broken link</a></p>\n</section>\n</main>`,
  }));
}

// sitemap.xml: every page a search engine should list. An incident's date is its
// last real update, so the file only changes when a page does.
function buildSitemap(incidents, out) {
  const newest = incidents[0]?.last_updated;
  const entry = (path, lastmod) => `<url><loc>${esc(`${SITE.url}/${path}`)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ""}</url>`;
  const urls = [entry("", newest), ...incidents.map((i) => entry(`incidents/${i.slug}.html`, i.last_updated)), ...PAGES.map((p) => entry(`${p.file}.html`))];
  writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}

// index.json: keep every existing field, refresh title/status/last_updated, say what kind of incident it is
// and which plain answer it is filed under, and list each incident's files.
function updateIndexJson(incidents, out) {
  const path = join(ROOT, "index.json");
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { incidents: [] };
  const bySlug = new Map((existing.incidents || []).map((e) => [e.slug, e]));
  const list = incidents.map((i) => {
    const prev = bySlug.get(i.slug) || {};
    const files = { ...i.files };
    for (const [k, v] of Object.entries(prev.files || {})) if (!(k in files)) files[k] = v;
    const filed = i.typed ? { incident_type: i.incident_type, answer_group: i.answer_group } : {};
    return { ...prev, slug: i.slug, title: i.title, status: i.status, last_updated: i.last_updated, ...filed, files };
  });
  writeFileSync(join(out, "index.json"), JSON.stringify({ ...existing, incidents: list }, null, 2) + "\n");
}
// llms.txt is written by hand. It must list every page and every incident's files;
// a missing entry stops the build. The sample incident is never listed.
function checkLlms(incidents) {
  const path = join(ROOT, "llms.txt");
  if (!existsSync(path)) return ["llms.txt: file is missing"];
  const txt = readFileSync(path, "utf8");
  const missing = [];
  for (const page of PAGES) if (!txt.includes(`${page.file}.html`)) missing.push(`${page.file}.html`);
  for (const i of incidents) if (!i.sample) for (const f of Object.values(i.files)) if (!txt.includes(f)) missing.push(f);
  return missing.map((f) => `llms.txt: does not list ${f}; add it in the same change`);
}

// ---------- main ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const out = outArg ? resolve(outArg) : ROOT;
  const inPlace = out === resolve(ROOT);
  if (args.includes("--sample") && inPlace) { console.error("--sample needs --out: the sample incident is made up and is never built into the real site."); process.exit(1); }
  mkdirSync(join(out, "incidents"), { recursive: true });
  if (!inPlace) cpSync(join(ROOT, "assets"), join(out, "assets"), { recursive: true });

  const folders = (base) => (existsSync(base) ? readdirSync(base).sort().map((d) => join(base, d)).filter((d) => existsSync(join(d, "incident.json"))) : []);
  const typedDirs = [...folders(join(ROOT, "data", "incidents")), ...(args.includes("--sample") ? folders(join(ROOT, "format", "sample")) : [])];
  const typed = typedDirs.map(loadTyped);
  for (const i of typed) if (i && i.loaded.dir.startsWith(join(ROOT, "format"))) i.sample = true;
  if (typed.includes(null)) { console.error("Build stopped: fix the problems above. A failed check is never bypassed."); process.exit(1); }
  const typedSlugs = new Set(typed.map((i) => i.slug));
  const legacy = readdirSync(join(ROOT, "incidents")).filter((f) => f.endsWith(".md") && !typedSlugs.has(basename(f, ".md"))).sort()
    .map((f) => loadLegacy(join(ROOT, "incidents", f)));
  const incidents = [...typed, ...legacy].sort((a, b) => String(b.last_updated).localeCompare(String(a.last_updated)) || a.slug.localeCompare(b.slug));

  const unlisted = checkLlms(incidents);
  if (unlisted.length) { for (const e of unlisted) console.error(e); console.error("Build stopped: fix the problems above. A failed check is never bypassed."); process.exit(1); }

  for (const i of incidents) {
    const others = incidents.filter((o) => o !== i).map((o) => ({ slug: o.slug, title: o.title, status: o.status, last_updated: o.last_updated }));
    (i.typed ? writeTyped : writeLegacy)(i, others, out);
  }
  buildHome(incidents, out);
  buildPages(out);
  buildSitemap(incidents, out);
  updateIndexJson(incidents, out);
  if (!inPlace) for (const f of ["llms.txt", "robots.txt"]) cpSync(join(ROOT, f), join(out, f));
  for (const i of incidents) console.log(`wrote incidents/${i.slug}.html${i.typed ? ` and ${i.slug}.md` : ""}`);
  console.log(`wrote index.html, ${PAGES.map((p) => `${p.file}.html`).join(", ")}, 404.html, sitemap.xml, index.json`);
  for (const w of warnings) console.warn(`warning: ${w}`);
}
