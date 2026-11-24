#!/usr/bin/env node
// isitahack.com static build. Plain Node, zero dependencies.
//
//   node scripts/build.mjs                        build the whole site into _site/
//   node scripts/build.mjs --out <dir>            build it into another folder
//   node scripts/build.mjs --out <dir> --sample   ...including the made-up sample incident
//
// Nothing the build writes is committed. GitHub builds the site the same way on every push to
// main and publishes the folder (.github/workflows/deploy.yml), so a change to a story is a
// change to its data and nothing else.
//
// Incidents come from two places:
//   data/incidents/<slug>/incident.json  the typed format (format/README.md). It is checked by
//                                        scripts/validate.mjs first; any problem stops the build.
//                                        The build writes incidents/<slug>.html and <slug>.md.
//   incidents/<slug>.md                  a hand-written page, for an incident not yet converted
//                                        (there are none today).
// The folder also gets index.html, status.html, how-it-works.html and about.html from
// pages/*.html, 404.html, sitemap.xml, index.json, and copies of assets/, each incident's data,
// format/, llms.txt and robots.txt. Output depends only on the input files: no clock, no
// locale, no randomness, so the same input always produces byte-identical output.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LABELS, ANSWER_GROUPS, answerPill, esc, slugify, pill, inline, linkTag, fmtDate, fmtDay, timeTag, renderBody, warnings, warn, setCurrent } from "./html.mjs";
import { loadIncident } from "./validate.mjs";
import { renderIncident, incidentMarkdown, incidentLayout, incidentPicture, evidenceBar, summarize, SERVICE_STATES, CADENCES } from "./incident.mjs";

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
// The status board is built from the incidents, so it is not in PAGES.
const STATUS_PAGE = { file: "status", title: "Status board", description: "Every incident isitahack.com is following, in one view: the answer so far, the kind of organization and incident, the day it happened and when it was last checked." };
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
// Before first paint on an incident page: how deep the reader last chose to read. A link to a
// place on the page shows everything, so its target is there. Without this script every depth shows.
const DEPTH_INIT = `<script>try{var d=localStorage.getItem("depth");document.documentElement.dataset.depth=location.hash.length>1?"evidence":d==="story"||d==="evidence"?d:"short"}catch(e){document.documentElement.dataset.depth="evidence"}</script>`;
// Optional enhancements: the theme toggle, the reading-depth switch, opening a collapsed row
// (and the depth it sits in) when a link points at it, and marking the section being read.
const ENHANCE = `<script>(function(){var r=document.documentElement,b=document.querySelector(".theme-toggle");function cur(){return r.dataset.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}function paint(){var d=cur()==="dark";b.setAttribute("aria-label",d?"Switch to light theme":"Switch to dark theme");b.setAttribute("aria-pressed",d?"true":"false")}if(b){b.hidden=false;paint();b.addEventListener("click",function(){var n=cur()==="dark"?"light":"dark";r.dataset.theme=n;try{localStorage.setItem("theme",n)}catch(e){}paint()})}var sw=document.querySelector(".depth-switch"),RANK={short:0,story:1,evidence:2};function setDepth(d,keep){if(!sw)return;r.dataset.depth=d;[].forEach.call(sw.querySelectorAll("button"),function(x){x.setAttribute("aria-pressed",x.getAttribute("data-depth")===d?"true":"false")});if(keep)try{localStorage.setItem("depth",d)}catch(e){}}if(sw){setDepth(r.dataset.depth||"evidence");document.addEventListener("click",function(e){var x=e.target.closest&&e.target.closest("button[data-depth]");if(x)setDepth(x.getAttribute("data-depth"),true)})}function reveal(){var id=decodeURIComponent(location.hash.slice(1));var el=id&&document.getElementById(id);if(!el)return;for(var p=el;p;p=p.parentElement){if(p.tagName==="DETAILS")p.open=true;var lv=p.getAttribute&&p.getAttribute("data-level");if(lv&&RANK[lv]>RANK[r.dataset.depth||"evidence"])setDepth(lv)}el.scrollIntoView()}addEventListener("hashchange",reveal);reveal();document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(a&&a.getAttribute("href")===location.hash)reveal()});var links=[].slice.call(document.querySelectorAll(".toc a"));if(links.length&&"IntersectionObserver"in window){var seen={};var io=new IntersectionObserver(function(es){es.forEach(function(e){seen[e.target.id]=e.isIntersecting});var on=null;links.forEach(function(a){var id=a.getAttribute("href").slice(1);if(!on&&seen[id])on=a});if(on)links.forEach(function(a){if(a===on)a.setAttribute("aria-current","true");else a.removeAttribute("aria-current")})},{rootMargin:"-10% 0px -60% 0px"});links.forEach(function(a){var s=document.getElementById(a.getAttribute("href").slice(1));if(s)io.observe(s)})}})();</script>`;

// Structured data for search engines. It only restates what the page shows.
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const ORG = { "@type": "Organization", "@id": `${SITE.url}/#org`, name: SITE.title, alternateName: SITE.name, url: `${SITE.url}/`, logo: `${SITE.url}/${SITE.logo}`, sameAs: [SITE.x, SITE.repo] };

// `path` is the page's address on the site ("" for the home page); `share` is the
// title to show when the page is shared, without the site name.
function shell({ title, share = title, description, root, path, body, banner = "", current = "", disclaimer = SITE.footer, markdown = "", article = null, data = [], noindex = false, card = null, depth = false }) {
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
    ["status", `${root}status.html`, "Status board"],
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
${THEME_INIT}${depth ? `\n${DEPTH_INIT}` : ""}
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
<a href="${root}status.html">Status board</a>
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
    root: "../", banner: statusBanner(i), body: main, disclaimer: i.disclaimer, markdown: `${i.slug}.md`, depth: true,
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
const INCIDENT_TYPES = [["outage", "Outages"], ["breach", "Data breaches"], ["attack", "Attacks"]];
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
// ---------- the status board ----------
// Every incident in one view: counts by answer, by kind of organisation and by kind of
// incident, the days they happened, and one sortable list. All of it is counted from the data.
const SUBJECT_KINDS = [["online-service", "Online services"], ["government", "Government"], ["finance", "Banks and finance"], ["health", "Health care"], ["aviation", "Aviation"], ["devices", "Devices"], ["telecom", "Telecom"], ["energy", "Energy"], ["network", "Networks"], ["other", "Other"]];
const TYPE_NAMES = { outage: "Outage", breach: "Data breach", attack: "Attack" };
const GROUP_COLUMNS = { unclear: "Unclear", "hack-stated": "Says hacked", "hack-reported": "Reported", "no-sign-of-hack": "No sign" };
const groupOf = (i) => i.answer_group || "unclear";
// One row per kind, one column per answer; kinds with no incidents are left out, the busiest first.
function countTable(caption, firstColumn, kinds, incidents, keyOf) {
  const rows = kinds.map(([key, name]) => {
    const of = incidents.filter((i) => keyOf(i) === key);
    return { name, total: of.length, cells: ANSWER_GROUPS.map((g) => of.filter((i) => groupOf(i) === g.key).length) };
  }).filter((r) => r.total).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const peak = Math.max(0, ...rows.flatMap((r) => r.cells));
  const cell = (n) => `<td${n === 0 ? ' class="zero"' : n === peak ? ' class="peak"' : ""}>${n}</td>`;
  const totals = ANSWER_GROUPS.map((g) => incidents.filter((i) => groupOf(i) === g.key).length);
  return `<div class="matrix-wrap">
<table class="matrix">
<caption class="sr-only">${esc(caption)}</caption>
<thead><tr><th scope="col">${esc(firstColumn)}</th>${ANSWER_GROUPS.map((g) => `<th scope="col">${esc(GROUP_COLUMNS[g.key])}</th>`).join("")}<th scope="col">All</th></tr></thead>
<tbody>
${rows.map((r) => `<tr><th scope="row">${esc(r.name)}</th>${r.cells.map(cell).join("")}<td class="total">${r.total}</td></tr>`).join("\n")}
</tbody>
<tfoot><tr><th scope="row">All</th>${totals.map((n) => `<td>${n}</td>`).join("")}<td>${incidents.length}</td></tr></tfoot>
</table>
</div>`;
}
// Incidents per day for the 30 days up to the newest one. Dates are plain calendar days.
function dayChart(incidents) {
  const days = incidents.map((i) => i.incident_date).filter(Boolean).sort();
  if (!days.length) return { html: "", older: 0 };
  const DAY = 86400000, end = Date.parse(`${days[days.length - 1]}T00:00:00Z`), SPAN = 30;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const counts = Array.from({ length: SPAN }, (_, k) => { const d = iso(end - (SPAN - 1 - k) * DAY); return { d, n: days.filter((x) => x === d).length }; });
  const older = days.filter((x) => x < counts[0].d).length;
  const W = 720, H = 210, x0 = 8, x1 = W - 8, y0 = H - 34, top = Math.max(...counts.map((c) => c.n));
  const band = (x1 - x0) / SPAN, barW = Math.min(18, band - 5);
  const short = (d) => fmtDay(d).replace(/, \d{4}$/, "");
  const out = [];
  counts.forEach((c, k) => {
    const cx = Math.round((x0 + band * (k + 0.5)) * 10) / 10;
    if ((SPAN - 1 - k) % 5 === 0) out.push(`<text class="chart-tick" x="${cx}" y="${y0 + 20}" text-anchor="${k === SPAN - 1 ? "end" : "middle"}">${esc(short(c.d))}</text>`);
    if (!c.n) return;
    const h = Math.round((c.n / top) * (y0 - 26) * 10) / 10, bx = Math.round((cx - barW / 2) * 10) / 10, by = Math.round((y0 - h) * 10) / 10;
    out.push(`<rect class="chart-bar series-1" x="${bx}" y="${by}" width="${barW}" height="${h}" rx="2"><title>${esc(`${short(c.d)}: ${c.n} incident${c.n === 1 ? "" : "s"}`)}</title></rect>`);
    out.push(`<text class="chart-value" x="${cx}" y="${Math.round((by - 6) * 10) / 10}" text-anchor="middle">${c.n}</text>`);
  });
  out.push(`<line class="chart-axis" x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}"/>`);
  const busiest = counts.reduce((a, c) => (c.n > a.n ? c : a));
  const alt = `Incidents by the day they happened, ${short(counts[0].d)} to ${short(counts[SPAN - 1].d)}. The most on one day is ${busiest.n}, on ${short(busiest.d)}.`;
  return { html: `<svg class="chart day-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">\n${out.join("\n")}\n</svg>`, older, from: counts[0].d, to: counts[SPAN - 1].d };
}
function buildStatus(incidents, out) {
  const byDay = [...incidents].sort((a, b) => String(b.incident_date || "").localeCompare(String(a.incident_date || "")) || a.slug.localeCompare(b.slug));
  const year = String(byDay[0]?.incident_date || "").slice(0, 4);
  const checkedOf = (i) => i.last_checked || i.last_updated;
  const newestCheck = incidents.map(checkedOf).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const stats = ANSWER_GROUPS.map((g) => {
    const n = incidents.filter((i) => groupOf(i) === g.key).length;
    return `<a class="stat" href="./#${g.key}" data-group="${g.key}" data-title="${esc(g.title)}">
<span class="stat-top"><span class="stat-n">${n}</span><span class="meta">of ${incidents.length}</span></span>
${answerPill(g)}
<span class="stat-bar" aria-hidden="true"><span style="width:${incidents.length ? Math.round((n / incidents.length) * 100) : 0}%"></span></span>
<span class="stat-means">${esc(g.means)}</span>
</a>`;
  }).join("\n");
  // Is it still down? Only incidents whose data says, on the strength of a sourced claim.
  // What is still down comes first; each line carries the time of the check it rests on.
  const RANK = { down: 0, "partly-back": 1, back: 2 }, at = (i) => (i.service.as_of ? Date.parse(i.service.as_of) : 0);
  const stated = incidents.filter((i) => i.service).sort((a, b) => RANK[a.service.state] - RANK[b.service.state] || at(b) - at(a) || a.slug.localeCompare(b.slug));
  const service = stated.length ? `<section class="wrap status-block" aria-labelledby="st-down">
<h2 id="st-down">Is it still down?</h2>
<p class="meta">Only where a sourced claim says how things stand: ${stated.length} of ${incidents.length} incidents. Each line is as of that incident's last check, which may be days old.</p>
<ul class="svc-list">
${stated.map((i) => `<li class="svc svc-${i.service.state}"${i.service.as_of ? ` data-asof="${esc(i.service.as_of)}"` : ""}><span class="svc-state"><span class="svc-mark" aria-hidden="true"></span>${esc(SERVICE_STATES[i.service.state])}</span><a class="svc-name" href="incidents/${esc(i.slug)}.html">${esc(rowName(i))}</a><span class="svc-text">${esc(i.service.text)}</span><span class="svc-when meta">${i.service.as_of ? `Checked ${timeTag(i.service.as_of)}` : ""}</span></li>`).join("\n")}
</ul>
</section>` : "";
  const chart = dayChart(incidents);
  const head = ["Incident", "Answer so far", "How big", "Happened", "Last checked", "Next check"];
  const EVERY = { hour: "Hourly", day: "Daily", "3 days": "Every 3 days", week: "Weekly" };
  const rows = byDay.map((i) => {
    const g = ANSWER_GROUPS.find((x) => x.key === groupOf(i));
    const kind = [TYPE_NAMES[i.incident_type], SUBJECT_KINDS.find(([k]) => k === i.subject?.kind)?.[1]].filter(Boolean).join(" · ");
    const cells = [
      `<a href="incidents/${esc(i.slug)}.html">${esc(rowName(i))}</a>${kind ? `<span class="kind">${esc(kind)}</span>` : ""}`,
      answerPill(g),
      esc(i.size || ""),
      i.incident_date ? timeTag(i.incident_date, rowDay(i.incident_date, year)) : "",
      timeTag(checkedOf(i), fmtDay(checkedOf(i))),
      i.next_check ? `<span class="due">${timeTag(i.next_check.due, i.next_check.every === "hour" ? fmtDate(i.next_check.due) : fmtDay(i.next_check.due))}</span><span class="kind" title="The desk checks ${esc(CADENCES[i.next_check.every])}">${EVERY[i.next_check.every]}</span>` : "",
    ];
    return `<tr data-group="${g.key}" data-name="${esc(rowName(i).toLowerCase())}" data-happened="${esc(i.incident_date || "")}" data-checked="${esc(checkedOf(i))}"${i.next_check ? ` data-due="${esc(i.next_check.due)}"` : ""}>${cells.map((c, n) => `<td data-label="${head[n]}">${c}</td>`).join("")}</tr>`;
  }).join("\n");
  const body = fill(readPage("status"), {
    root: "", stats, service,
    checked: newestCheck ? `Last check: ${timeTag(newestCheck)}.` : "",
    by_subject: countTable("Incidents by kind of organization and by answer", "Organization", SUBJECT_KINDS, incidents, (i) => i.subject?.kind || "other"),
    by_type: countTable("Incidents by kind of incident and by answer", "Incident", INCIDENT_TYPES, incidents, (i) => i.incident_type),
    when_chart: chart.html,
    when_note: chart.html ? `Incidents by the day they happened, ${esc(fmtDay(chart.from))} to ${esc(fmtDay(chart.to))}.${chart.older ? ` ${chart.older} older incident${chart.older === 1 ? " is" : "s are"} not on the chart.` : ""}` : "",
    count: `${incidents.length} of ${incidents.length}`,
    list: `<div class="table-wrap" role="region" aria-label="All incidents table" tabindex="0">\n<table class="data-table status-list">\n<thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n</div>`,
  });
  writeFileSync(join(out, "status.html"), shell({ title: `${STATUS_PAGE.title} | ${SITE.title}`, share: STATUS_PAGE.title, description: STATUS_PAGE.description, root: "", path: "status.html", body, current: "status" }));
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
  const urls = [entry("", newest), ...incidents.map((i) => entry(`incidents/${i.slug}.html`, i.last_updated)), entry(`${STATUS_PAGE.file}.html`, newest), ...PAGES.map((p) => entry(`${p.file}.html`))];
  writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}

// index.json: every incident with what kind it is, which plain answer it is filed under,
// whether the service is back, when it is next due a check, and where its files are. Made
// fresh on every build.
function updateIndexJson(incidents, out) {
  const list = incidents.map((i) => {
    const filed = i.typed ? { incident_type: i.incident_type, answer_group: i.answer_group } : {};
    if (i.service) filed.service = { state: i.service.state, as_of: i.service.as_of };
    // When each story was last checked and when its next check is due, so the desk's agents can
    // work the overdue ones first.
    if (i.last_checked) filed.last_checked = i.last_checked;
    if (i.next_check) Object.assign(filed, { check_every: i.next_check.every, next_check_due: i.next_check.due });
    return { slug: i.slug, title: i.title, status: i.status, last_updated: i.last_updated, ...filed, files: { ...i.files } };
  });
  writeFileSync(join(out, "index.json"), JSON.stringify({ incidents: list }, null, 2) + "\n");
}
// llms.txt is written by hand. It must list every page and every incident's files;
// a missing entry stops the build. The sample incident is never listed.
function checkLlms(incidents) {
  const path = join(ROOT, "llms.txt");
  if (!existsSync(path)) return ["llms.txt: file is missing"];
  const txt = readFileSync(path, "utf8");
  const missing = [];
  for (const page of [...PAGES, STATUS_PAGE]) if (!txt.includes(`${page.file}.html`)) missing.push(`${page.file}.html`);
  for (const i of incidents) if (!i.sample) for (const f of Object.values(i.files)) if (!txt.includes(f)) missing.push(f);
  return missing.map((f) => `llms.txt: does not list ${f}; add it in the same change`);
}

// Is this repository path something the build writes? Such a file must never be committed
// (scripts/check.mjs refuses it). `hasData(slug)` says whether an incident has a data folder:
// until it does, its hand-written incidents/<slug>.md is a source, not a built page.
const BUILT_AT_ROOT = new Set(["index.html", "status.html", "404.html", "sitemap.xml", "index.json", ...PAGES.map((p) => `${p.file}.html`)]);
export function isBuiltPage(file, hasData) {
  if (BUILT_AT_ROOT.has(file) || file.startsWith("_site/")) return true;
  const page = file.match(/^incidents\/([^/]+)\.(html|md)$/);
  return Boolean(page) && (page[2] === "html" || hasData(page[1]));
}

// ---------- main ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const SITE_DIR = join(ROOT, "_site");
  const out = outArg ? resolve(outArg) : SITE_DIR;
  if (out === resolve(ROOT)) { console.error("The build no longer writes into the repository itself. Leave --out off to build into _site/."); process.exit(1); }
  if (args.includes("--sample") && out === SITE_DIR) { console.error("--sample needs --out: the sample incident is made up and is never built into the real site."); process.exit(1); }
  // _site/ is the build's own folder, so it starts empty each time and holds nothing stale.
  if (out === SITE_DIR) rmSync(SITE_DIR, { recursive: true, force: true });
  mkdirSync(join(out, "incidents"), { recursive: true });
  cpSync(join(ROOT, "assets"), join(out, "assets"), { recursive: true });

  const folders = (base) => (existsSync(base) ? readdirSync(base).sort().map((d) => join(base, d)).filter((d) => existsSync(join(d, "incident.json"))) : []);
  const typedDirs = [...folders(join(ROOT, "data", "incidents")), ...(args.includes("--sample") ? folders(join(ROOT, "format", "sample")) : [])];
  const typed = typedDirs.map(loadTyped);
  for (const i of typed) if (i && i.loaded.dir.startsWith(join(ROOT, "format"))) i.sample = true;
  if (typed.includes(null)) { console.error("Build stopped: fix the problems above. A failed check is never bypassed."); process.exit(1); }
  const typedSlugs = new Set(typed.map((i) => i.slug));
  const legacy = (existsSync(join(ROOT, "incidents")) ? readdirSync(join(ROOT, "incidents")) : []).filter((f) => f.endsWith(".md") && !typedSlugs.has(basename(f, ".md"))).sort()
    .map((f) => loadLegacy(join(ROOT, "incidents", f)));
  const incidents = [...typed, ...legacy].sort((a, b) => String(b.last_updated).localeCompare(String(a.last_updated)) || a.slug.localeCompare(b.slug));

  const unlisted = checkLlms(incidents);
  if (unlisted.length) { for (const e of unlisted) console.error(e); console.error("Build stopped: fix the problems above. A failed check is never bypassed."); process.exit(1); }

  for (const i of incidents) {
    const others = incidents.filter((o) => o !== i).map((o) => ({ slug: o.slug, title: o.title, status: o.status, last_updated: o.last_updated }));
    (i.typed ? writeTyped : writeLegacy)(i, others, out);
  }
  buildHome(incidents, out);
  buildStatus(incidents, out);
  buildPages(out);
  buildSitemap(incidents, out);
  updateIndexJson(incidents, out);
  // The rest of what the site serves: the map for programs, the crawler rules, the custom
  // domain, and the format files that the schemas' own addresses point at.
  for (const f of ["llms.txt", "robots.txt", "CNAME", ".nojekyll"]) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(out, f));
  cpSync(join(ROOT, "format"), join(out, "format"), { recursive: true });
  for (const i of incidents) console.log(`wrote incidents/${i.slug}.html${i.typed ? ` and ${i.slug}.md` : ""}`);
  console.log(`wrote index.html, status.html, ${PAGES.map((p) => `${p.file}.html`).join(", ")}, 404.html, sitemap.xml, index.json`);
  console.log(`site built in ${out}`);
  for (const w of warnings) console.warn(`warning: ${w}`);
}
