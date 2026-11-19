// Shared HTML helpers for the build: escaping, dates, label pills and the small
// Markdown subset. Plain Node, no dependencies. Everything here is a pure
// function of its input, so the build stays deterministic.

export const LABELS = ["Confirmed", "Reported", "Unverified", "Rumor", "Debunked", "Not established"];

export const warnings = [];
let CURRENT = "";
export const setCurrent = (file) => { CURRENT = file; };
export const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ---------- escaping ----------
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export const slugify = (s) =>
  s.toLowerCase().replace(/\*\*|`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
const labelClass = (l) => "pill-" + l.toLowerCase().replace(/ /g, "-");
export const pill = (l) => `<span class="pill ${labelClass(l)}" data-label="${esc(l)}">${esc(l)}</span>`;

// ---------- dates (string parsing only, independent of the machine's zone/locale) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/;
const zoneName = (off) => (off === "-05:00" || off === "-04:00" ? "ET" : off ? (off === "Z" ? "UTC" : `UTC${off}`) : "");
const clock = (hh, mm) => `${+hh % 12 || 12}:${mm} ${+hh < 12 ? "AM" : "PM"}`;
export function fmtDate(iso) {
  const m = String(iso).match(ISO);
  if (!m) return String(iso);
  const [, y, mo, d, hh, mm, off] = m;
  const date = `${MONTHS[+mo - 1]} ${+d}, ${y}`;
  if (hh === undefined) return date;
  const zone = zoneName(off);
  return `${date}, ${clock(hh, mm)}${zone ? " " + zone : ""}`;
}
// "8:40 AM" (no date, no zone) and "Jan 12, 2026" from an ISO date-time.
export function fmtTime(iso) { const m = String(iso).match(ISO); return m && m[4] !== undefined ? clock(m[4], m[5]) : String(iso); }
export function fmtDay(iso) { const m = String(iso).match(ISO); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(iso); }
export const timeTag = (iso, text) => `<time datetime="${esc(iso)}">${esc(text ?? fmtDate(iso))}</time>`;

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

// A table cell that is exactly one of the six labels becomes a pill.
function cellHtml(text) {
  const t = text.trim();
  if (LABELS.includes(t)) return pill(t);
  if (/^[CRD]$/.test(t)) warn(CURRENT, `raw label code "${t}" in a table cell; expected a full label`);
  return inline(t);
}

// ---------- block Markdown ----------
const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

// head: array of column headings; rows: arrays of ready-made cell HTML.
export function tableHtml(head, rows) {
  const th = head.map((h) => `<th scope="col">${inline(h)}</th>`).join("");
  const tr = rows
    .map((r) => "<tr>" + r.map((c, i) => `<td data-label="${esc(head[i].replace(/\*\*|`/g, ""))}">${c}</td>`).join("") + "</tr>")
    .join("\n");
  const plain = (c) => c.replace(/<[^>]*>/g, "");
  const cls = head.length <= 2 && rows.every((r) => r.every((c) => plain(c).length < 40)) ? "data-table compact" : "data-table";
  return `<div class="table-wrap" role="region" aria-label="${esc(head.join(", "))} table" tabindex="0">\n<table class="${cls}">\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody>\n</table>\n</div>`;
}
function renderTable(lines) {
  const head = splitRow(lines[0]);
  if (!/^\|?\s*:?-{3,}/.test(lines[1] || "")) throw new Error(`${CURRENT}: table without separator row: ${lines[0]}`);
  const rows = lines.slice(2).map(splitRow);
  rows.forEach((r, i) => {
    if (r.length !== head.length)
      throw new Error(`${CURRENT}: table row ${i + 1} has ${r.length} cells, header has ${head.length}: ${lines[i + 2].slice(0, 80)}`);
  });
  return tableHtml(head, rows.map((r) => r.map(cellHtml)));
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

// Returns { title, pre, sections }: the first H1, the blocks before the first
// H2, and one { id, heading, blocks } per H2.
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
  const pre = [];
  const sections = [];
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
