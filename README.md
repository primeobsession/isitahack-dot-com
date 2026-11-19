# isitahack.com

Public-source fact-checks of security news. Each incident carries a label (Confirmed, Reported, Unverified, Rumor, Debunked, Not established), source links, and a dated update log.

Made for entertainment using AI. Not endorsed by anyone named on the site.

## How it works

An incident is a folder of typed data: one `incident.json` plus CSV files for its claims, sources, timeline, questions, quotes and update log. AI agents edit the data. A check script validates it. A build script turns it into the page. Nobody edits a page by hand.

```
data/incidents/<slug>/   the data for one incident (the source of truth)
format/                  what every field is for, as JSON Schema and table definitions
scripts/validate.mjs     checks an incident folder; a failed check stops the build
scripts/build.mjs        writes the HTML pages and a Markdown version of each incident
pages/                   the copy for Home, How it works and About
assets/site.css          one shared stylesheet, light and dark
```

The site is static files served by GitHub Pages. The built pages (`index.html`, `how-it-works.html`, `about.html`, `incidents/*.html`, `incidents/*.md`) are committed next to their sources.

```sh
node scripts/validate.mjs     # check every incident under data/incidents
node scripts/build.mjs        # rebuild the site in place
```

Both are plain Node with no dependencies. See `format/README.md` for the incident format and `scripts/README.md` for the build.

## Layout

- `data/incidents/<slug>/`: an incident's data, and `raw/` for preserved source material with a sha256 `MANIFEST.txt`.
- `incidents/<slug>.html` and `<slug>.md`: the page and its plain-text version, built from the data.
- `index.json`, `llms.txt`: machine-readable indexes.

## Status

- `incidents/2026-11-faa-ground-stop.md` (FAA nationwide ground stop, Nov 13, 2026) is still a hand-written Markdown page from before the typed format. The build renders it as it is until it is converted.
- `format/sample/` holds a made-up incident used to test the format. It is never built into the site.
