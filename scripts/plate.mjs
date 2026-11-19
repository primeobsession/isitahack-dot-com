// The picture every incident has: its subject's name set in type over a simple drawing
// for the kind of thing it is. The build draws it, so it is always there, always in
// the site's own style, and never anyone's logo. An incident may also carry a
// photograph (incident.json `lead_image`), which takes the plate's place.
//
// Pure function of its input: inline SVG that takes its colours from the page.

import { esc } from "./html.mjs";

// Each drawing sits in a 340 x 340 box. Classes: `faint` for background lines,
// `tint` for a soft fill, `solid` for a filled mark.
export const SUBJECT_KINDS = {
  aviation: {
    label: "Aviation",
    art: `<circle cx="170" cy="170" r="150"/><circle class="faint" cx="170" cy="170" r="100"/><circle class="faint" cx="170" cy="170" r="50"/><path class="faint" d="M20 170H320M170 20V320"/><path class="tint" d="M170 170L170 20A150 150 0 0 1 300 95Z"/><path d="M170 170L300 95"/><circle class="solid" cx="232" cy="118" r="8"/><circle class="solid" cx="118" cy="232" r="6"/><circle class="solid" cx="252" cy="214" r="6"/>`,
  },
  "online-service": {
    label: "Online service",
    art: `<path class="tint" d="M85 235H245a55 55 0 0 0 5-110a82 82 0 0 0-155-25a68 68 0 0 0-10 135z"/><path d="M85 235H245a55 55 0 0 0 5-110a82 82 0 0 0-155-25a68 68 0 0 0-10 135z"/><path class="faint" d="M120 265V300M165 265V318M210 265V300"/><circle class="solid" cx="120" cy="312" r="6"/><circle class="solid" cx="210" cy="312" r="6"/>`,
  },
  devices: {
    label: "Devices and apps",
    art: `<rect class="faint" x="24" y="112" width="176" height="208" rx="18"/><rect class="tint" x="150" y="28" width="156" height="292" rx="28"/><rect x="150" y="28" width="156" height="292" rx="28"/><path d="M208 56H248M204 296H252"/><rect class="solid" x="178" y="92" width="40" height="40" rx="10"/><rect class="solid" x="238" y="92" width="40" height="40" rx="10"/><rect class="solid" x="178" y="152" width="40" height="40" rx="10"/><rect class="faint" x="238" y="152" width="40" height="40" rx="10"/>`,
  },
  finance: {
    label: "Finance",
    art: `<g transform="rotate(-8 170 170)"><rect class="tint" x="22" y="78" width="296" height="186" rx="18"/><rect x="22" y="78" width="296" height="186" rx="18"/><path class="band" d="M22 128H318"/><rect class="solid" x="52" y="162" width="54" height="40" rx="7"/><path class="faint" d="M52 232H150M172 232H232"/></g>`,
  },
  government: {
    label: "Government",
    art: `<path class="tint" d="M30 128L170 48L310 128Z"/><path d="M30 128L170 48L310 128Z"/><path d="M42 150H298"/><path d="M72 164V268M121 164V268M170 164V268M219 164V268M268 164V268"/><path d="M30 284H310"/><path class="faint" d="M14 310H326"/>`,
  },
  telecom: {
    label: "Telecom",
    art: `<path d="M170 312V118"/><path d="M108 312L170 150L232 312"/><path class="faint" d="M133 246H207M149 204H191"/><path d="M125 108A45 45 0 0 1 215 108"/><path d="M95 108A75 75 0 0 1 245 108"/><path class="faint" d="M65 108A105 105 0 0 1 275 108"/><circle class="solid" cx="170" cy="108" r="9"/>`,
  },
  energy: {
    label: "Energy",
    art: `<circle class="faint" cx="170" cy="170" r="150"/><path class="tint" d="M192 30L88 192H160L140 310L252 140H180Z"/><path d="M192 30L88 192H160L140 310L252 140H180Z"/>`,
  },
  health: {
    label: "Health",
    art: `<rect class="tint" x="40" y="40" width="260" height="260" rx="44"/><rect x="40" y="40" width="260" height="260" rx="44"/><path class="heavy" d="M170 108V232M108 170H232"/>`,
  },
  network: {
    label: "Networks",
    art: `<path class="faint" d="M62 82L280 62M72 280L288 270"/><path d="M170 170L62 82M170 170L280 62M170 170L72 280M170 170L288 270"/><circle class="tint" cx="170" cy="170" r="30"/><circle cx="170" cy="170" r="30"/><circle class="solid" cx="62" cy="82" r="16"/><circle class="solid" cx="280" cy="62" r="16"/><circle class="solid" cx="72" cy="280" r="16"/><circle class="solid" cx="288" cy="270" r="16"/>`,
  },
  other: {
    label: "",
    art: `<path d="M170 30A140 140 0 0 1 170 310"/><path class="dotted" d="M170 310A140 140 0 0 1 170 30"/><path class="heavy" d="M132 132a40 40 0 1 1 56 37c-12 6-18 14-18 28"/><circle class="solid" cx="170" cy="232" r="11"/>`,
  },
};

// The name is never scaled by the browser, so pick a size its length fits in.
const nameSize = (name) => (name.length <= 4 ? 132 : name.length <= 5 ? 108 : name.length <= 7 ? 90 : name.length <= 10 ? 76 : name.length <= 14 ? 64 : name.length <= 18 ? 50 : 42);

export function renderPlate(subject) {
  const kind = SUBJECT_KINDS[subject.kind] ? subject.kind : "other";
  const { label, art } = SUBJECT_KINDS[kind];
  return `<svg class="plate" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(subject.name)}${label ? `: ${esc(label.toLowerCase())}` : ""}">
<rect class="plate-bg" width="640" height="360"/>
<path class="plate-rule" d="M36 72H604"/>
<g class="plate-art" transform="translate(352 22) scale(0.78)">${art}</g>
${label ? `<text class="plate-kind" x="36" y="52">${esc(label)}</text>` : ""}
<text class="plate-name" x="34" y="322" font-size="${nameSize(subject.name)}">${esc(subject.name)}</text>
</svg>`;
}
