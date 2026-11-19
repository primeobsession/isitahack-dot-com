// Draws a chart as inline SVG from a chart spec (incident.json "charts") and its
// CSV rows. No dependencies, no client-side script. Colours come from CSS custom
// properties (--series-1..4, --rule, --muted, --ink, --surface) so the same
// markup works in the light and dark themes. Every mark carries a <title>, which
// browsers show on hover, and the page prints the numbers as a table underneath.

import { esc, fmtTime, fmtDay } from "./html.mjs";

const W = 720, H = 320;
const PAD = { top: 28, right: 28, bottom: 46, left: 58 };
const round = (n) => Math.round(n * 10) / 10;

function group3(n) {
  const [whole, frac] = String(n).split(".");
  const s = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${s}.${frac}` : s;
}
export const fmtNumber = (n) => group3(Number.isInteger(n) ? n : Math.round(n * 100) / 100);
function niceScale(max) {
  if (max <= 0) return { top: 1, step: 1 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}
const tickText = (v, top) => (top >= 10000 ? `${Math.round((v / 1000) * 10) / 10}K` : fmtNumber(v));

export function renderChart(chart, rows) {
  // an empty cell is a gap: no reading at that point
  const series = chart.series.map((s, i) => ({ ...s, n: i + 1, values: rows.map((r) => (r[s.column] === "" ? null : Number(r[s.column]))) }));
  const max = Math.max(...series.flatMap((s) => s.values.filter((v) => v !== null)));
  const { top, step } = niceScale(max);
  const x0 = PAD.left, x1 = W - PAD.right, y0 = H - PAD.bottom, y1 = PAD.top;
  const y = (v) => round(y0 - (v / top) * (y0 - y1));
  const unit = chart.unit ? ` ${chart.unit}` : "";
  const out = [];

  // gridlines and y ticks (recessive, solid hairlines)
  for (let v = 0; v <= top + step / 2; v += step) {
    out.push(`<line class="chart-grid" x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}"/>`);
    out.push(`<text class="chart-tick" x="${x0 - 10}" y="${y(v) + 4}" text-anchor="end">${esc(tickText(v, top))}</text>`);
  }

  if (chart.type === "line") {
    const times = rows.map((r) => Date.parse(r[chart.x.column]));
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const x = (t) => round(x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0));
    const multiDay = new Set(rows.map((r) => r[chart.x.column].slice(0, 10))).size > 1;
    // x labels: skip any that would crowd the one before it; always keep the first and the last
    const shown = [];
    rows.forEach((r, i) => {
      const px = x(times[i]);
      if (!shown.length || px - shown[shown.length - 1].px >= 76) shown.push({ i, px });
      else if (i === rows.length - 1) shown[shown.length - 1] = { i, px };
    });
    for (const { i, px } of shown) {
      const iso = rows[i][chart.x.column];
      const anchor = i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle";
      out.push(`<text class="chart-tick" x="${px}" y="${y0 + 20}" text-anchor="${anchor}">${esc(multiDay ? `${fmtDay(iso).replace(/, \d{4}$/, "")} ${fmtTime(iso)}` : fmtTime(iso))}</text>`);
    }
    for (const s of series) {
      const pts = s.values.map((v, i) => (v === null ? null : `${x(times[i])},${y(v)}`)).filter(Boolean);
      out.push(`<polyline class="chart-line series-${s.n}" points="${pts.join(" ")}"/>`);
      s.values.forEach((v, i) => {
        if (v === null) return;
        const label = `${fmtTime(rows[i][chart.x.column])}: ${fmtNumber(v)}${unit}${series.length > 1 ? ` (${s.label})` : ""}`;
        out.push(`<circle class="chart-dot series-${s.n}" cx="${x(times[i])}" cy="${y(v)}" r="4"/>`);
        out.push(`<circle class="chart-hit" cx="${x(times[i])}" cy="${y(v)}" r="14"><title>${esc(label)}</title></circle>`);
      });
    }
    // direct labels, sparingly: the peak of a single series; the line ends of several
    if (series.length === 1) {
      const s = series[0], i = s.values.indexOf(max);
      const anchor = i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle";
      out.push(`<text class="chart-value" x="${x(times[i])}" y="${y(max) - 10}" text-anchor="${anchor}">${esc(fmtNumber(max))}</text>`);
    }
  } else {
    const band = (x1 - x0) / rows.length;
    const barW = Math.min(24, (band - 16) / series.length - 2);
    const groupW = series.length * barW + (series.length - 1) * 2;
    const labelBars = rows.length * series.length <= 8;
    rows.forEach((r, i) => {
      const cx = x0 + band * (i + 0.5);
      out.push(`<text class="chart-tick" x="${round(cx)}" y="${y0 + 20}" text-anchor="middle">${esc(r[chart.x.column])}</text>`);
      series.forEach((s, j) => {
        const v = s.values[i];
        if (v === null) return;
        const bx = round(cx - groupW / 2 + j * (barW + 2)), by = y(v), bh = round(y0 - by);
        const rad = Math.min(4, bh, barW / 2);
        // rounded at the data end, square on the baseline
        const d = `M${bx},${y0} V${round(by + rad)} Q${bx},${by} ${round(bx + rad)},${by} H${round(bx + barW - rad)} Q${round(bx + barW)},${by} ${round(bx + barW)},${round(by + rad)} V${y0} Z`;
        out.push(`<path class="chart-bar series-${s.n}" d="${d}"><title>${esc(`${r[chart.x.column]}, ${s.label}: ${fmtNumber(v)}${unit}`)}</title></path>`);
        if (labelBars) out.push(`<text class="chart-value" x="${round(bx + barW / 2)}" y="${by - 7}" text-anchor="middle">${esc(fmtNumber(v))}</text>`);
      });
    });
  }
  out.push(`<line class="chart-axis" x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}"/>`);
  out.push(`<text class="chart-tick" x="${x1}" y="${H - 6}" text-anchor="end">${esc(chart.x.label)}</text>`);
  if (chart.unit) out.push(`<text class="chart-tick" x="0" y="12">${esc(chart.unit)}</text>`);

  const legend = series.length > 1
    ? `<ul class="chart-legend">${series.map((s) => `<li><span class="chart-swatch series-${s.n}" aria-hidden="true"></span>${esc(s.label)}</li>`).join("")}</ul>\n`
    : "";
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(chart.alt)}">\n${out.join("\n")}\n</svg>`;
}
