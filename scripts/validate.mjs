#!/usr/bin/env node
// Checks incident folders against format/incident.schema.json and format/tables.schema.json.
// Plain Node, no dependencies.
//
//   node scripts/validate.mjs [incident-folder ...]
//
// With no arguments it checks every folder under data/incidents that has an
// incident.json. Exit code 0 when everything passes, 1 when any problem is found.
// The build imports loadIncident() from here, so the page is always built from
// data that has passed these checks.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const INCIDENT_SCHEMA = readJson(join(ROOT, "format", "incident.schema.json"));
const TABLE_SCHEMA = readJson(join(ROOT, "format", "tables.schema.json"));
export const LABELS = TABLE_SCHEMA.labels;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATETIME = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;
const FORMATS = {
  date: (s) => DATE.test(s) || "must be a date like 2026-11-13",
  "date-time": (s) => DATETIME.test(s) || "must be a date and time with offset like 2026-11-13T15:54:00-05:00",
  "date-or-datetime": (s) => DATE.test(s) || DATETIME.test(s) || "must be a date (2026-11-13) or a date and time with offset",
};
// Privacy lint (operations manual 2.9): no social handles or email addresses in any text.
const HANDLE = /(^|[^A-Za-z0-9._%+\/-])@[A-Za-z0-9_]{2,}/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?<![\d.])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/;
const USERNAME = /(^|[^A-Za-z0-9])\/?u\/[A-Za-z0-9_-]{3,}/;
// Returns what the privacy rule objects to in a piece of text, or "" when it is clean.
export function privacyProblem(text) {
  if (HANDLE.test(text) || EMAIL.test(text)) return "contains a handle or email address (privacy rule)";
  if (PHONE.test(text)) return "contains what looks like a phone number (privacy rule)";
  if (USERNAME.test(text)) return "contains a forum username (privacy rule)";
  return "";
}
// Only the owner decides a verdict (operations manual 2.11.4). Until one is approved,
// no text may use the verdict's words, not even as "likely" or "candidate".
const VERDICT_WORDS = /confirmed\s+(not\s+)?(a\s+)?hack\b/i;
// Social platforms are Tier 4 or 5 whoever posts there (operations manual 2.2): leads,
// never a basis for Confirmed.
const SOCIAL_HOSTS = ["x.com", "twitter.com", "facebook.com", "instagram.com", "threads.net", "threads.com", "tiktok.com", "reddit.com", "bsky.app", "truthsocial.com", "t.me", "linkedin.com", "mastodon.social"];
const isSocial = (url) => { try { const h = new URL(url).hostname.toLowerCase(); return SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`)); } catch { return false; } };
// The main question becomes the page title and main heading, so it has to make
// sense on its own in a list of search results.
const VAGUE_QUESTION = /^(was|is|were|are|did|does|do|has|have|had|can|could|will|would)\s+(it|this|that|they|these|those|there)\b/i;
const MAIN_QUESTION_MAX = 70;
const show = (v) => JSON.stringify(v);

// ---------- JSON Schema (the subset the incident schema uses) ----------
const jsonType = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
function deref(schema) {
  if (!schema.$ref) return schema;
  const target = schema.$ref.replace(/^#\//, "").split("/").reduce((node, key) => node?.[key], INCIDENT_SCHEMA);
  if (!target) throw new Error(`schema: cannot resolve ${schema.$ref}`);
  const { $ref, ...rest } = schema;
  return { ...deref(target), ...rest };
}
function checkJson(rawSchema, value, path, errs) {
  const schema = deref(rawSchema);
  if (schema.oneOf) {
    const branches = schema.oneOf.map(deref);
    const kinds = branches.map((b) => b.properties?.type?.const).filter(Boolean);
    const picked = value && typeof value === "object" ? branches.find((b) => b.properties?.type?.const === value.type) : null;
    if (picked) return checkJson(picked, value, path, errs);
    errs.push(`${path}: "type" must be one of ${kinds.join(", ")}; got ${show(value?.type)}`);
    return;
  }
  if (schema.type) {
    const allowed = [].concat(schema.type);
    const actual = jsonType(value);
    if (!allowed.includes(actual) && !(actual === "integer" && allowed.includes("number"))) {
      errs.push(`${path}: expected ${allowed.join(" or ")}, got ${actual}`);
      return;
    }
  }
  if ("const" in schema && value !== schema.const) errs.push(`${path}: must be ${show(schema.const)}, got ${show(value)}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: ${show(value)} is not one of ${schema.enum.map(show).join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: too short (${value.length} characters, minimum ${schema.minLength})`);
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path}: too long (${value.length} characters, maximum ${schema.maxLength})`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: ${show(value)} does not match ${schema.pattern}`);
    if (schema.format && FORMATS[schema.format]) { const ok = FORMATS[schema.format](value); if (ok !== true) errs.push(`${path}: ${show(value)} ${ok}`); }
    const privacy = privacyProblem(value);
    if (privacy) errs.push(`${path}: ${privacy}`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: ${value} is below the minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: ${value} is above the maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: needs at least ${schema.minItems} item(s)`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: has ${value.length} items, maximum ${schema.maxItems}`);
    if (schema.items) value.forEach((item, i) => checkJson(schema.items, item, `${path}[${i}]`, errs));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errs.push(`${path}.${key}: missing (required)`);
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) checkJson(sub, v, `${path}.${key}`, errs);
      else if (schema.additionalProperties === false) errs.push(`${path}.${key}: unknown field (allowed: ${Object.keys(schema.properties || {}).join(", ")})`);
    }
  }
}

// ---------- CSV (RFC 4180, UTF-8, LF) ----------
export function parseCsv(text, file, errs) {
  if (text.charCodeAt(0) === 0xfeff) errs.push(`${file}: starts with a byte-order mark; save as plain UTF-8`);
  if (text.includes("\r")) errs.push(`${file}: has CR line endings; use LF only`);
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (quoted) errs.push(`${file}: a quoted field is never closed`);
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function checkCell(field, raw, where, errs) {
  const c = field.constraints || {};
  const isList = field.type === "list";
  if (raw === "") { if (c.required) errs.push(`${where}: empty, but this column is required`); return isList ? [] : null; }
  if (/^(n\/a|null|none)$/i.test(raw)) errs.push(`${where}: leave the cell empty instead of ${show(raw)}`);
  if (field.type === "integer" || field.type === "number") {
    const ok = field.type === "integer" ? /^-?\d+$/.test(raw) : /^-?\d+(\.\d+)?$/.test(raw);
    if (!ok) { errs.push(`${where}: ${show(raw)} is not ${field.type === "integer" ? "a whole number" : "a number"}`); return null; }
    const n = Number(raw);
    if (c.minimum != null && n < c.minimum) errs.push(`${where}: ${n} is below the minimum ${c.minimum}`);
    if (c.maximum != null && n > c.maximum) errs.push(`${where}: ${n} is above the maximum ${c.maximum}`);
    return n;
  }
  if (field.type === "datetime") { const ok = FORMATS["date-time"](raw); if (ok !== true) errs.push(`${where}: ${show(raw)} ${ok}`); return raw; }
  if (field.type === "date") { const ok = FORMATS.date(raw); if (ok !== true) errs.push(`${where}: ${show(raw)} ${ok}`); return raw; }
  if (isList) {
    const items = raw.split(field.delimiter || ";").map((s) => s.trim());
    for (const item of items) {
      if (item === "") errs.push(`${where}: has an empty item; check for a stray ${show(field.delimiter || ";")}`);
      else if (c.itemPattern && !new RegExp(c.itemPattern).test(item)) errs.push(`${where}: ${show(item)} does not match ${c.itemPattern}`);
    }
    return items.filter(Boolean);
  }
  if (c.enum && !c.enum.includes(raw)) errs.push(`${where}: ${show(raw)} is not one of ${c.enum.join(", ")}`);
  if (c.pattern && !new RegExp(c.pattern).test(raw)) errs.push(`${where}: ${show(raw)} does not match ${c.pattern}`);
  if (c.maxLength != null && raw.length > c.maxLength) errs.push(`${where}: too long (${raw.length} characters, maximum ${c.maxLength})`);
  if (c.format && FORMATS[c.format]) { const ok = FORMATS[c.format](raw); if (ok !== true) errs.push(`${where}: ${show(raw)} ${ok}`); }
  if (!/_url$/.test(field.name)) { const privacy = privacyProblem(raw); if (privacy) errs.push(`${where}: ${privacy}`); }
  return raw;
}
function readTable(dir, file, fields, errs, required = true) {
  const path = join(dir, file);
  if (!existsSync(path)) { if (required) errs.push(`${file}: file is missing`); return []; }
  const rows = parseCsv(readFileSync(path, "utf8"), file, errs);
  const expected = fields.map((f) => f.name);
  if (!rows.length || rows[0].join(",") !== expected.join(",")) {
    errs.push(`${file}: header row must be exactly: ${expected.join(",")}`);
    return [];
  }
  const records = [];
  const seen = Object.fromEntries(fields.filter((f) => f.constraints?.unique).map((f) => [f.name, new Set()]));
  rows.slice(1).forEach((cells, i) => {
    const at = `${file} row ${i + 1}`;
    if (cells.length === 1 && cells[0] === "") return errs.push(`${at}: blank row`);
    if (cells.length !== expected.length) return errs.push(`${at}: has ${cells.length} cells, expected ${expected.length}`);
    const record = { _row: i + 1 };
    fields.forEach((field, j) => {
      record[field.name] = checkCell(field, cells[j], `${at}, ${field.name}`, errs);
      if (seen[field.name] && cells[j] !== "") {
        if (seen[field.name].has(cells[j])) errs.push(`${at}, ${field.name}: ${show(cells[j])} is used more than once`);
        seen[field.name].add(cells[j]);
      }
    });
    records.push(record);
  });
  return records;
}

// ---------- one incident ----------
// Returns { errs, head, t, chartData, tableData }. `t` holds the typed rows of
// each standard table; chartData and tableData are keyed by chart/table id.
export function loadIncident(dir) {
  const errs = [];
  const empty = { head: null, t: {}, chartData: {}, tableData: {} };
  const headPath = join(dir, "incident.json");
  if (!existsSync(headPath)) return { errs: [`incident.json: file is missing`], ...empty };
  let head;
  try { head = readJson(headPath); } catch (e) { return { errs: [`incident.json: not valid JSON (${e.message})`], ...empty }; }
  checkJson(INCIDENT_SCHEMA, head, "incident.json", errs);
  if (head.slug !== basename(resolve(dir))) errs.push(`incident.json.slug: ${show(head.slug)} must equal the folder name ${show(basename(resolve(dir)))}`);

  // tables, then foreign keys between them
  const t = {};
  for (const [name, def] of Object.entries(TABLE_SCHEMA.tables)) t[name] = readTable(dir, def.path, def.fields, errs, def.required);
  const ids = (table, column) => new Set(t[table].map((r) => r[column]).filter(Boolean));
  for (const [name, def] of Object.entries(TABLE_SCHEMA.tables)) {
    for (const fk of def.foreignKeys || []) {
      const targets = ids(fk.reference.resource, fk.reference.fields);
      for (const r of t[name]) for (const v of [].concat(r[fk.fields] ?? [])) {
        if (!targets.has(v)) errs.push(`${def.path} row ${r._row}, ${fk.fields}: ${show(v)} is not in ${TABLE_SCHEMA.tables[fk.reference.resource].path}`);
      }
    }
  }
  const claims = new Map(t.claims.map((r) => [r.claim_id, r]));
  const sources = new Map(t.sources.map((r) => [r.source_id, r]));
  const questions = new Map(t.questions.map((r) => [r.question_id, r]));

  // label rule: Confirmed needs an official source, or two independent ones
  for (const c of t.claims) {
    if (c.label !== "Confirmed") continue;
    const cited = (c.source_ids || []).map((id) => sources.get(id)).filter(Boolean);
    const official = cited.some((s) => s.source_tier === 1);
    const groups = new Set(cited.filter((s) => s.source_tier === 2 || s.source_tier === 3).map((s) => s.independence_group).filter(Boolean));
    if (!official && groups.size < 2) errs.push(`claims.csv row ${c._row}, label: Confirmed needs a Tier 1 source, or two Tier 2/3 sources with different independence_group values`);
  }
  for (const s of t.sources) {
    if (s.source_url && isSocial(s.source_url) && s.source_tier < 4) errs.push(`sources.csv row ${s._row}, source_tier: a post on a social platform is Tier 4 or 5, whoever posted it (operations manual 2.2)`);
    if (s.link_status === "dead" && !s.archive_url) errs.push(`sources.csv row ${s._row}, archive_url: required when link_status is dead`);
    if ((s.link_status === "ok" || s.link_status === "archived") && !s.retrieved_at) errs.push(`sources.csv row ${s._row}, retrieved_at: required when link_status is ${s.link_status}`);
  }
  for (const q of t.questions) {
    const at = `questions.csv row ${q._row}`;
    if (q.state === "answered") {
      if (!q.answer_text) errs.push(`${at}, answer_text: required once state is answered`);
      if (!q.label) errs.push(`${at}, label: required once state is answered`);
      if (!q.claim_ids?.length) errs.push(`${at}, claim_ids: required once state is answered`);
      if (!q.answered_at) errs.push(`${at}, answered_at: required once state is answered`);
    }
    if ((q.state === "open" || q.label === "Not established") && !q.what_would_settle_it) errs.push(`${at}, what_would_settle_it: required while open, and when the label is Not established`);
  }
  const logTimes = t.update_log.map((r) => r.logged_at).filter(Boolean).map((s) => Date.parse(s));
  if (logTimes.some((ms, i) => i > 0 && ms > logTimes[i - 1])) errs.push(`update_log.csv: rows must be newest first`);
  if (!t.update_log.some((r) => r.change_type !== "checked_no_change")) errs.push(`update_log.csv: needs at least one row that is not checked_no_change`);

  // the head's references
  const main = questions.get(head.main_question_id);
  if (!main) errs.push(`incident.json.main_question_id: ${show(head.main_question_id)} is not in questions.csv`);
  else {
    const at = `questions.csv row ${main._row}, question_text`;
    if (main.state !== "answered") errs.push(`incident.json.main_question_id: the main question must have an answer and a label (use Not established if nothing settles it)`);
    const text = main.question_text || "";
    if (VAGUE_QUESTION.test(text)) errs.push(`${at}: the main question must name its subject, for example "Was the FAA ground stop a cyberattack?"; it is the page title, and ${show(text)} means nothing in a list of search results`);
    if (text && !text.endsWith("?")) errs.push(`${at}: the main question must end with a question mark`);
    if (text.length > MAIN_QUESTION_MAX) errs.push(`${at}: the main question is the page title; keep it to ${MAIN_QUESTION_MAX} characters (it has ${text.length})`);
  }
  (head.known || []).forEach((k, i) => {
    const c = claims.get(k.claim_id);
    if (!c) errs.push(`incident.json.known[${i}].claim_id: ${show(k.claim_id)} is not in claims.csv`);
    else if (c.label !== "Confirmed") errs.push(`incident.json.known[${i}]: rests on ${k.claim_id}, which is labelled ${c.label}; only Confirmed claims can be listed as known`);
  });
  (head.not_known || []).forEach((k, i) => {
    if (k.question_id && !questions.has(k.question_id)) errs.push(`incident.json.not_known[${i}].question_id: ${show(k.question_id)} is not in questions.csv`);
  });
  (head.figures || []).forEach((f, i) => { if (!claims.has(f.claim_id)) errs.push(`incident.json.figures[${i}].claim_id: ${show(f.claim_id)} is not in claims.csv`); });
  if (head.verdict) {
    if (!head.verdict_approved_at) errs.push(`incident.json.verdict_approved_at: required when a verdict is set (the owner approves every verdict)`);
    if (head.status !== "closed") errs.push(`incident.json.status: must be closed once a verdict is set`);
  } else if (head.status === "closed") errs.push(`incident.json.verdict: a closed incident needs an approved verdict`);

  // charts
  const numeric = /^-?\d+(\.\d+)?$/;
  const chartData = {};
  for (const [i, chart] of (head.charts || []).entries()) {
    const at = `incident.json.charts[${i}]`;
    for (const id of chart.source_ids || []) if (!sources.has(id)) errs.push(`${at}.source_ids: ${show(id)} is not in sources.csv`);
    if (typeof chart.data !== "string" || !existsSync(join(dir, chart.data))) { errs.push(`${at}.data: file ${show(chart.data)} is missing`); continue; }
    const rows = parseCsv(readFileSync(join(dir, chart.data), "utf8"), chart.data, errs);
    const header = rows[0] || [];
    const columns = [chart.x?.column, ...(chart.series || []).map((s) => s.column)];
    for (const col of columns) if (!header.includes(col)) errs.push(`${chart.data}: has no column ${show(col)} (header is ${header.join(",")})`);
    if (rows.length < 3) errs.push(`${chart.data}: a chart needs at least two rows of data`);
    rows.slice(1).forEach((cells, r) => {
      const xValue = cells[header.indexOf(chart.x?.column)];
      if (chart.x?.kind === "time" && xValue !== undefined && !DATETIME.test(xValue)) errs.push(`${chart.data} row ${r + 1}, ${chart.x.column}: ${show(xValue)} must be a date and time with offset`);
      if (chart.x?.kind === "category" && xValue === "") errs.push(`${chart.data} row ${r + 1}, ${chart.x.column}: empty`);
      for (const s of chart.series || []) {
        const v = cells[header.indexOf(s.column)];
        if (v !== undefined && v !== "" && !numeric.test(v)) errs.push(`${chart.data} row ${r + 1}, ${s.column}: ${show(v)} is not a number`);
      }
    });
    for (const s of chart.series || []) {
      const filled = rows.slice(1).filter((cells) => numeric.test(cells[header.indexOf(s.column)] ?? "")).length;
      if (header.includes(s.column) && filled < 2) errs.push(`${chart.data}: column ${show(s.column)} needs at least two numbers`);
    }
    chartData[chart.id] = rows.slice(1).map((cells) => Object.fromEntries(header.map((h, j) => [h, cells[j]])));
  }
  // images
  for (const [i, image] of (head.images || []).entries()) {
    const at = `incident.json.images[${i}]`;
    if (image.rights !== "own" && !image.source_id) errs.push(`${at}.source_id: required unless rights is own`);
    if (image.source_id && !sources.has(image.source_id)) errs.push(`${at}.source_id: ${show(image.source_id)} is not in sources.csv`);
    if (typeof image.file !== "string" || !existsSync(join(dir, image.file))) { errs.push(`${at}.file: ${show(image.file)} is missing`); continue; }
    const bytes = readFileSync(join(dir, image.file));
    const sum = createHash("sha256").update(bytes).digest("hex");
    if (sum !== image.sha256) errs.push(`${at}.sha256: does not match the file (file is ${sum})`);
    if (image.file.endsWith(".svg") && /<script|\son[a-z]+\s*=|href\s*=\s*["']https?:/i.test(bytes.toString("utf8"))) errs.push(`${at}.file: SVG must not contain scripts, event handlers or external links`);
  }
  // extra tables
  const tableData = {};
  for (const [i, table] of (head.tables || []).entries()) {
    const at = `incident.json.tables[${i}]`;
    if (typeof table.data !== "string" || !existsSync(join(dir, table.data))) { errs.push(`${at}.data: file ${show(table.data)} is missing`); continue; }
    const fields = (table.columns || []).map((c) => ({
      name: c.name,
      type: c.type === "number" ? "number" : "string",
      constraints: c.type === "label" ? { enum: LABELS } : c.type === "source" ? { pattern: "^s[0-9]{3,}$" } : {},
    }));
    const rows = readTable(dir, table.data, fields, errs);
    for (const c of table.columns || []) if (c.type === "source") for (const r of rows) {
      if (r[c.name] && !sources.has(r[c.name])) errs.push(`${table.data} row ${r._row}, ${c.name}: ${show(r[c.name])} is not in sources.csv`);
    }
    tableData[table.id] = rows;
  }
  // sections
  const defined = (list) => new Set((list || []).map((x) => x.id));
  const claimGroups = ids("claims", "group"), quoteGroups = ids("quotes", "group");
  const byKind = { chart: defined(head.charts), image: defined(head.images), table: defined(head.tables) };
  (Array.isArray(head.sections) ? head.sections : []).forEach((s, i) => {
    const at = `incident.json.sections[${i}]`;
    if (s?.type === "claims" && !claimGroups.has(s.group)) errs.push(`${at}.group: no claims.csv row has group ${show(s.group)}`);
    if (s?.type === "quotes" && !quoteGroups.has(s.group)) errs.push(`${at}.group: no quotes.csv row has group ${show(s.group)}`);
    if (byKind[s?.type] && !byKind[s.type].has(s.id)) errs.push(`${at}.id: no ${s.type} with id ${show(s.id)} is defined in incident.json.${s.type}s`);
    if (s?.type === "note" && typeof s.file === "string" && !existsSync(join(dir, s.file))) errs.push(`${at}.file: ${show(s.file)} is missing`);
  });
  // notes are free text: the privacy rule applies to them too
  const notes = [];
  for (const s of Array.isArray(head.sections) ? head.sections : []) {
    if (s?.type !== "note" || typeof s.file !== "string" || !existsSync(join(dir, s.file))) continue;
    const text = readFileSync(join(dir, s.file), "utf8");
    notes.push([s.file, text]);
    text.split("\n").forEach((line, i) => {
      const privacy = privacyProblem(line.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, ""));
      if (privacy) errs.push(`${s.file} line ${i + 1}: ${privacy}`);
    });
  }
  // verdict wording, anywhere, while no verdict is approved
  if (!head.verdict) {
    const flag = (where, text) => { if (typeof text === "string" && VERDICT_WORDS.test(text)) errs.push(`${where}: uses the words of a final verdict (${show(text.match(VERDICT_WORDS)[0])}) but no verdict is approved; only the owner decides one, so do not name a likely verdict`); };
    const walk = (value, path) => {
      if (typeof value === "string") flag(path, value);
      else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(head, "incident.json");
    for (const [name, def] of Object.entries(TABLE_SCHEMA.tables)) for (const r of t[name]) for (const f of def.fields) {
      if (!/_url$/.test(f.name)) flag(`${def.path} row ${r._row}, ${f.name}`, r[f.name]);
    }
    for (const [file, text] of notes) text.split("\n").forEach((line, i) => flag(`${file} line ${i + 1}`, line));
  }
  return { errs, head, t, chartData, tableData };
}
export const validateIncident = (dir) => loadIncident(dir).errs;

// ---------- command line ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let dirs = process.argv.slice(2);
  if (!dirs.length) {
    const base = join(ROOT, "data", "incidents");
    dirs = existsSync(base) ? readdirSync(base).sort().map((d) => join(base, d)).filter((d) => existsSync(join(d, "incident.json"))) : [];
    if (!dirs.length) { console.log("No incident folders with an incident.json found under data/incidents."); process.exit(0); }
  }
  let failed = 0;
  for (const dir of dirs) {
    const errs = validateIncident(dir);
    if (errs.length) { failed++; console.log(`FAIL ${dir} (${errs.length} problem${errs.length === 1 ? "" : "s"})`); for (const e of errs) console.log(`  ${e}`); }
    else console.log(`OK   ${dir}`);
  }
  process.exit(failed ? 1 : 0);
}
