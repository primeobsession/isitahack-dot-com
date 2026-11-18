# isitahack.com

Public-source fact-checks of security news. Each incident carries a label (Confirmed, Reported, Unverified, Rumor, Debunked, Not established), source links, and a dated update log.

Made for entertainment using AI. Not endorsed by anyone named on the site.

## Status

Starter skeleton only. The generator and the full site are not built. Planned: one Markdown file per incident with YAML front-matter, rendered to static HTML by a small Node script, plus `index.json` and `llms.txt`, hosted on GitHub Pages. Conventions are in the operations manual (private repo `primeobsession/isitahack-ops`), sections 6 and 7.

## Layout

- `incidents/<slug>.md`: one page per incident.
- `data/incidents/<slug>/raw/`: preserved source material, copied byte-for-byte; `MANIFEST.txt` has a sha256 for each file.
- `index.json`, `llms.txt`: machine-readable indexes.
- `scripts/build.mjs`: renders `incidents/*.md` to `incidents/*.html` and regenerates `index.html`; see `scripts/README.md`.
- `assets/site.css`: shared stylesheet.

## First incident

`incidents/2026-11-faa-ground-stop.md`: FAA nationwide ground stop, Nov 13, 2026. Still being monitored.
