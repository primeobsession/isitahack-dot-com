#!/usr/bin/env node
// isitahack.com static build. Plain Node, zero dependencies.
//
//   node scripts/build.mjs
//
// Reads incidents/*.md (YAML front-matter + Markdown body), writes
// incidents/<slug>.html next to each .md, regenerates index.html from the
// incidents' front-matter, and adds the .html path to each entry in
// index.json. Output depends only on the input files: no clock, no locale,
// no randomness, so the same input always produces byte-identical output.
//
// The Markdown parser handles the subset the incident pages use (headings,
// paragraphs, pipe tables, blockquotes, bullet and task lists, links, bare
// URLs, **bold**, `code`). Anything it does not understand is rendered as
// escaped text, never dropped. All content is HTML-escaped.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INCIDENTS_DIR = join(ROOT, "incidents");

// Site copy, taken verbatim from README.md and the original index.html.
const SITE = {
  name: "isitahack.com",
  tagline:
    "Public-source fact-checks of security news. Each incident carries a label (Confirmed, Reported, Unverified, Rumor, Debunked, Not established), source links, and a dated update log.",
  footer: "Made for entertainment using AI. Not endorsed by anyone named here.",
};

export const LABELS = ["Confirmed", "Reported", "Unverified", "Rumor", "Debunked", "Not established"];
const STATUSES = { monitoring: "Monitoring", resolved: "Resolved", closed: "Closed" };

const warnings = [];
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ---------- escaping ----------
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const slugify = (s) =>
  s.toLowerCase().replace(/\*\*|`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
const labelClass = (l) => "pill-" + l.toLowerCase().replace(/ /g, "-");
export const pill = (l) => `<span class="pill ${labelClass(l)}" data-label="${esc(l)}">${esc(l)}</span>`;

// ---------- front-matter (small YAML subset: scalars and one level of maps) ----------
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

// ---------- dates (string parsing only, independent of the machine's zone/locale) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/);
  if (!m) return String(iso);
  const [, y, mo, d, hh, mm, off] = m;
  const date = `${MONTHS[+mo - 1]} ${+d}, ${y}`;
  if (hh === undefined) return date;
  const h = +hh, ap = h < 12 ? "AM" : "PM", h12 = h % 12 || 12;
  const zone = off === "-05:00" || off === "-04:00" ? "ET" : off ? (off === "Z" ? "UTC" : `UTC${off}`) : "";
  return `${date}, ${h12}:${mm} ${ap}${zone ? " " + zone : ""}`;
}

// ---------- inline Markdown ----------
const INLINE_RE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|`([^`\n]+)`|(https?:\/\/[^\s<>|()]*[^\s<>|().,;:!?'"])/g;
const isHttp = (u) => /^https?:\/\//i.test(u);
export const linkTag = (href, inner) => `<a href="${esc(href)}" rel="noopener">${inner}</a>`;

export function inline(s, { links = true } = {}) {
  let out = "", last = 0;
  for (const m of s.matchAll(INLINE_RE)) {
    const [whole, ltext, lurl, bold, code, bare] = m;
    if (!links && (ltext !== undefined || bare !== undefined)) continue;
    out += esc(s.slice(last, m.index));
    if (ltext !== undefined) {
      out += isHttp(lurl) ? linkTag(lurl, inline(ltext, { links: false })) : esc(whole);
    } else if (bold !== undefined) {
      out += `<strong>${inline(bold, { links })}</strong>`;
    } else if (code !== undefined) {
      out += `<code>${esc(code)}</code>`;
    } else {
      out += linkTag(bare, esc(bare));
    }
    last = m.index + whole.length;
  }
  return out + esc(s.slice(last));
}

// A table cell or list status that is exactly one of the six labels becomes a pill.
function cellHtml(text) {
  const t = text.trim();
  if (LABELS.includes(t)) return pill(t);
  if (/^[CRD]$/.test(t)) warn(CURRENT, `raw label code "${t}" in a table cell; expected a full label`);
  return inline(t);
}

// ---------- block Markdown ----------
let CURRENT = "";
const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function renderTable(lines) {
  const head = splitRow(lines[0]);
  if (!/^\|?\s*:?-{3,}/.test(lines[1] || "")) throw new Error(`${CURRENT}: table without separator row: ${lines[0]}`);
  const rows = lines.slice(2).map(splitRow);
  rows.forEach((r, i) => {
    if (r.length !== head.length)
      throw new Error(`${CURRENT}: table row ${i + 1} has ${r.length} cells, header has ${head.length}: ${lines[i + 2].slice(0, 80)}`);
  });
  const th = head.map((h) => `<th scope="col">${inline(h)}</th>`).join("");
  const tr = rows
    .map((r) => "<tr>" + r.map((c, i) => `<td data-label="${esc(head[i].replace(/\*\*|`/g, ""))}">${cellHtml(c)}</td>`).join("") + "</tr>")
    .join("\n");
  const cls = head.length <= 2 && rows.every((r) => r.every((c) => c.length < 40)) ? "data-table compact" : "data-table";
  return `<div class="table-wrap" role="region" aria-label="${esc(head.join(", "))} table" tabindex="0">\n<table class="${cls}">\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody>\n</table>\n</div>`;
}

function renderList(lines) {
  const isTask = lines.every((l) => /^[-*] \[[ xX]\] /.test(l));
  const items = lines.map((l) => {
    if (isTask) {
      const done = /^[-*] \[[xX]\]/.test(l);
      const text = l.replace(/^[-*] \[[ xX]\] /, "");
      return `<li class="${done ? "task done" : "task open"}"><span class="task-mark" aria-hidden="true">${done ? "✓" : "○"}</span><span class="sr-only">${done ? "Checked: " : "Open: "}</span><span class="task-text">${inline(text)}</span></li>`;
    }
    return `<li>${inline(l.replace(/^[-*] /, ""))}</li>`;
  });
  return `<ul${isTask ? ' class="tasks"' : ""}>\n${items.join("\n")}\n</ul>`;
}

function renderQuote(lines) {
  const inner = lines.map((l) => l.replace(/^>\s?/, ""));
  const paras = [];
  let buf = [];
  for (const l of inner) {
    if (l.trim() === "") { if (buf.length) paras.push(buf.join(" ")); buf = []; }
    else buf.push(l.trim());
  }
  if (buf.length) paras.push(buf.join(" "));
  // "> — Speaker" as the last paragraph is an attributed quotation.
  const last = paras[paras.length - 1] || "";
  if (paras.length > 1 && /^— /.test(last)) {
    const body = paras.slice(0, -1).map((p) => `<p>${inline(p)}</p>`).join("\n");
    return `<figure class="quote">\n<blockquote>\n${body}\n</blockquote>\n<figcaption>${inline(last)}</figcaption>\n</figure>`;
  }
  // "> **Lead.** text" is a callout.
  const lead = paras[0] && paras[0].match(/^\*\*(.+?)\*\*\s*(.*)$/);
  if (lead) {
    const kind = /entertainment/i.test(paras.join(" ")) ? "callout disclaimer" : /^STATUS/i.test(lead[1]) ? "callout status" : "callout";
    const first = `<p><strong class="callout-lead">${inline(lead[1], { links: false })}</strong> ${inline(lead[2])}</p>`;
    const rest = paras.slice(1).map((p) => `<p>${inline(p)}</p>`);
    return `<aside class="${kind}">\n${[first, ...rest].join("\n")}\n</aside>`;
  }
  return `<blockquote>\n${paras.map((p) => `<p>${inline(p)}</p>`).join("\n")}\n</blockquote>`;
}

export function renderBody(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const ids = new Map();
  const uniqueId = (text) => {
    const base = slugify(text);
    const n = (ids.get(base) || 0) + 1;
    ids.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  let title = null;
  const pre = []; // blocks before the first H2
  const sections = []; // { id, heading, blocks }
  const push = (html) => (sections.length ? sections[sections.length - 1].blocks : pre).push(html);

  let i = 0;
  const take = (test) => { const out = []; while (i < lines.length && test(lines[i])) out.push(lines[i++]); return out; };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      i++;
      const level = h[1].length, text = h[2].trim();
      if (level === 1 && title === null) { title = text; continue; }
      if (level === 2) { sections.push({ id: uniqueId(text), heading: text, blocks: [] }); continue; }
      push(`<h${Math.min(level + 1, 6)} id="${uniqueId(text)}">${inline(text)}</h${Math.min(level + 1, 6)}>`);
      continue;
    }
    if (line.startsWith("|")) { push(renderTable(take((l) => l.startsWith("|")))); continue; }
    if (line.startsWith(">")) { push(renderQuote(take((l) => l.startsWith(">")))); continue; }
    if (/^[-*] /.test(line)) { push(renderList(take((l) => /^[-*] /.test(l)))); continue; }
    if (/^```/.test(line)) {
      i++;
      const code = take((l) => !/^```/.test(l));
      i++;
      push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const para = take((l) => l.trim() !== "" && !/^(#{1,6}\s|\||>|[-*] |```)/.test(l));
    push(`<p>${inline(para.map((l) => l.trim()).join(" "))}</p>`);
  }
  return { title, pre, sections };
}

// ---------- page shell ----------
// Shared <head> partial (Google Tag Manager, requested by Justin). Inserted
// verbatim into every generated page; edit it in one place.
const HEAD_PARTIAL = readFileSync(join(ROOT, "scripts", "partials", "head.html"), "utf8").replace(/\n+$/, "");

function shell({ title, description, cssHref, body, homeHref }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${HEAD_PARTIAL}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="${esc(cssHref)}">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><a class="brand" href="${esc(homeHref)}">${esc(SITE.name)}</a></header>
${body}
</body>
</html>
`;
}

function statusBanner(fm) {
  const status = STATUSES[fm.status] || String(fm.status || "Unknown");
  return `<div class="status-banner status-${esc(slugify(String(fm.status || "unknown")))}" role="status">
<span class="status-dot" aria-hidden="true"></span><strong>Status: ${esc(status)}</strong><span class="sep" aria-hidden="true">·</span><span>Last updated <time datetime="${esc(fm.last_updated)}">${esc(fmtDate(fm.last_updated))}</time></span>
</div>`;
}

function labelTally(fm) {
  const s = fm.labels_summary;
  if (!s) return "";
  const items = LABELS.filter((l) => l in s)
    .map((l) => `<li>${pill(l)} <span class="count">${esc(s[l])}</span></li>`)
    .join("");
  const basis = fm.labels_summary_basis ? `<p class="tally-basis">Counts: ${esc(fm.labels_summary_basis)}</p>` : "";
  return `<section class="tally" aria-label="Label counts">\n<ul class="tally-list">${items}</ul>\n${basis}\n</section>`;
}

function renderIncident(file) {
  CURRENT = basename(file);
  const src = readFileSync(file, "utf8");
  const { fm, body } = parseFrontMatter(src, CURRENT);
  const slug = basename(file, ".md");
  if (fm.slug !== slug) throw new Error(`${CURRENT}: front-matter slug "${fm.slug}" does not match filename`);
  for (const k of ["title", "status", "last_updated", "disclaimer"]) if (!fm[k]) throw new Error(`${CURRENT}: front-matter missing ${k}`);
  if (fm.labels_summary) for (const k of Object.keys(fm.labels_summary)) if (!LABELS.includes(k)) throw new Error(`${CURRENT}: unknown label ${k}`);

  const doc = renderBody(body);
  const title = doc.title || fm.title;

  // Staleness hints (warnings only; content is rendered as written).
  const lu = body.match(/Last updated ([^.;]*?\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4})/);
  if (lu && fm.last_updated && !fmtDate(String(fm.last_updated).slice(0, 10)).startsWith(lu[1].match(/[A-Z][a-z]{2}[a-z]* \d{1,2}/)[0].replace(/^(\w{3})\w*/, "$1")))
    warn(CURRENT, `body says "Last updated ${lu[1]}" but front-matter last_updated is ${fm.last_updated}`);

  const toc = doc.sections
    .map((s) => `<li><a href="#${esc(s.id)}">${inline(s.heading, { links: false })}</a></li>`)
    .join("\n");
  const sectionsHtml = doc.sections
    .map((s) => `<section id="${esc(s.id)}" class="section section-${esc(s.id)}">\n<h2>${inline(s.heading)}</h2>\n${s.blocks.join("\n")}\n</section>`)
    .join("\n\n");

  const meta = [];
  if (fm.incident_date) meta.push(`Incident date <time datetime="${esc(fm.incident_date)}">${esc(fmtDate(fm.incident_date))}</time>`);
  const html = shell({
    title: `${fm.title} | ${SITE.name}`,
    description: fm.disclaimer,
    cssHref: "../assets/site.css",
    homeHref: "../index.html",
    body: `${statusBanner(fm)}
<main id="main" class="incident">
<article>
<header class="incident-header">
<h1>${inline(title)}</h1>
${meta.length ? `<p class="meta">${meta.join(" · ")}</p>` : ""}
${labelTally(fm)}
</header>
${doc.pre.join("\n")}
<details class="toc">
<summary>On this page</summary>
<ol>
${toc}
</ol>
</details>

${sectionsHtml}
</article>
</main>
<footer class="site-footer">
<p class="disclaimer-short">${esc(fm.disclaimer)}</p>
<p class="alt-formats">Also available as <a href="${esc(slug)}.md">Markdown</a>${fm.data_dir ? ` · <a href="../${esc(String(fm.data_dir).replace(/\/?$/, "/"))}">raw data</a>` : ""} · <a href="../index.json">index.json</a> · <a href="../llms.txt">llms.txt</a></p>
<p><a href="../index.html">← All incidents</a></p>
</footer>`,
  });
  writeFileSync(join(INCIDENTS_DIR, `${slug}.html`), html);
  return { slug, fm };
}

function renderHome(incidents) {
  const cards = incidents
    .map(({ slug, fm }) => {
      const status = STATUSES[fm.status] || String(fm.status);
      const tally = fm.labels_summary
        ? `<ul class="tally-list">${LABELS.filter((l) => l in fm.labels_summary).map((l) => `<li>${pill(l)} <span class="count">${esc(fm.labels_summary[l])}</span></li>`).join("")}</ul>`
        : "";
      return `<li class="card">
<p class="card-status status-${esc(slugify(String(fm.status)))}"><span class="status-dot" aria-hidden="true"></span>${esc(status)}</p>
<h2><a href="incidents/${esc(slug)}.html">${esc(fm.title)}</a></h2>
<p class="meta">${fm.incident_date ? `Incident date <time datetime="${esc(fm.incident_date)}">${esc(fmtDate(fm.incident_date))}</time> · ` : ""}Last updated <time datetime="${esc(fm.last_updated)}">${esc(fmtDate(fm.last_updated))}</time></p>
${tally}
<p class="card-links"><a class="button" href="incidents/${esc(slug)}.html">Read the fact-check</a> <a href="incidents/${esc(slug)}.md">Markdown</a></p>
</li>`;
    })
    .join("\n");
  const monitoring = incidents.filter(({ fm }) => fm.status === "monitoring");
  const latest = incidents[0];
  const banner = latest
    ? `<div class="status-banner status-${monitoring.length ? "monitoring" : "resolved"}" role="status">
<span class="status-dot" aria-hidden="true"></span><strong>${monitoring.length ? `Monitoring ${monitoring.length} incident${monitoring.length === 1 ? "" : "s"}` : "No incidents being monitored"}</strong><span class="sep" aria-hidden="true">·</span><span>Last updated <time datetime="${esc(latest.fm.last_updated)}">${esc(fmtDate(latest.fm.last_updated))}</time></span>
</div>`
    : "";
  const html = shell({
    title: SITE.name,
    description: SITE.tagline,
    cssHref: "assets/site.css",
    homeHref: "index.html",
    body: `${banner}
<main id="main" class="home">
<header class="home-header">
<h1>${esc(SITE.name)}</h1>
<p class="lede">${esc(SITE.tagline)}</p>
</header>
<h2 class="list-heading">Incidents</h2>
<ul class="cards">
${cards}
</ul>
</main>
<footer class="site-footer">
<p class="disclaimer-short">${esc(SITE.footer)}</p>
<p class="alt-formats">Machine-readable: <a href="index.json">index.json</a> · <a href="llms.txt">llms.txt</a></p>
</footer>`,
  });
  writeFileSync(join(ROOT, "index.html"), html);
}

// index.json: keep every existing field, refresh title/status/last_updated from
// front-matter, and add files.html next to files.page.
function updateIndexJson(incidents) {
  const path = join(ROOT, "index.json");
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { incidents: [] };
  const bySlug = new Map((existing.incidents || []).map((e) => [e.slug, e]));
  const out = incidents.map(({ slug, fm }) => {
    const prev = bySlug.get(slug) || {};
    const files = { ...(prev.files || {}) };
    const ordered = { page: `incidents/${slug}.md`, html: `incidents/${slug}.html` };
    for (const [k, v] of Object.entries(files)) if (!(k in ordered)) ordered[k] = v;
    return { ...prev, slug, title: fm.title, status: fm.status, last_updated: fm.last_updated, files: ordered };
  });
  writeFileSync(path, JSON.stringify({ ...existing, incidents: out }, null, 2) + "\n");
}

function checkLlms(incidents) {
  const path = join(ROOT, "llms.txt");
  if (!existsSync(path)) return warn("llms.txt", "missing");
  const txt = readFileSync(path, "utf8");
  for (const { slug } of incidents)
    for (const ext of ["md", "html"]) if (!txt.includes(`incidents/${slug}.${ext}`)) warn("llms.txt", `does not list incidents/${slug}.${ext}`);
}

// ---------- main ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = readdirSync(INCIDENTS_DIR).filter((f) => f.endsWith(".md")).sort();
  const incidents = files.map((f) => renderIncident(join(INCIDENTS_DIR, f)));
  incidents.sort((a, b) => (String(b.fm.last_updated).localeCompare(String(a.fm.last_updated)) || a.slug.localeCompare(b.slug)));
  renderHome(incidents);
  updateIndexJson(incidents);
  checkLlms(incidents);
  for (const { slug } of incidents) console.log(`wrote incidents/${slug}.html`);
  console.log("wrote index.html, index.json");
  for (const w of warnings) console.warn(`warning: ${w}`);
}
