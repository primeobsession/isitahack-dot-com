# scripts

Plain Node (tested on Node 22), zero dependencies, no framework or bundler.

## build.mjs

```sh
node scripts/build.mjs                            # build the site in place
node scripts/build.mjs --out _preview             # build a copy into a folder
node scripts/build.mjs --out _preview --sample    # ...and include the made-up sample incident
```

What it does:

1. For every `data/incidents/<slug>/incident.json`, loads the folder through `validate.mjs`. Any problem stops the build; a failed check is never bypassed. It then writes `incidents/<slug>.html` and a Markdown version, `incidents/<slug>.md`. Both are outputs.
2. For every other `incidents/<slug>.md`, renders the hand-written page as it is. This is how an incident not yet in the typed format can stay on the site; no incident uses it at the moment. Its front-matter may carry `question`, `answer`, `answer_label` and `latest` so the page can lead with the short answer and the latest update.
3. Writes `index.html`, `how-it-works.html` and `about.html` from `pages/*.html`.
4. Updates `index.json`, keeping existing fields.
5. Warns (does not fail) when `llms.txt` does not list a page or an incident's files.

The build reads no clock, locale or environment, so the same input produces byte-identical output. All content is HTML-escaped.

`--sample` only works with `--out`: the sample incident in `format/sample/` is made up and must never be built into the real site. To look at a preview, serve the folder, for example `python3 -m http.server --directory _preview`.

## validate.mjs

```sh
node scripts/validate.mjs [incident-folder ...]
```

Checks incident folders against `format/incident.schema.json` and `format/tables.schema.json`, and against the label, privacy and verdict rules. With no arguments it checks everything under `data/incidents`. Exit code 1 on any problem. See `format/README.md` for the list of checks.

## The other modules

- `incident.mjs`: turns one loaded incident into page HTML and Markdown.
- `chart.mjs`: draws a chart as inline SVG from a chart definition and its CSV rows. No client-side script; every mark has a hover title and the page prints the numbers as a table.
- `html.mjs`: escaping, dates, label tags and the Markdown subset shared by the above.

The Markdown subset (hand-written pages and `notes/*.md`): `#`–`######` headings, paragraphs, pipe tables, `>` blockquotes (a final `> — Name` line makes an attributed quote, a leading `**Lead**` makes a callout), `-` lists and `- [ ]`/`- [x]` task lists, `[text](url)`, bare URLs, `**bold**`, `` `code` ``, and fenced code blocks. Anything else is rendered as escaped text, never dropped.

## Incident page layout

Every incident page has three parts: a contents list that follows the reader, the report, and a side rail with the latest update, the label breakdown and the other incidents. On narrower screens the rail moves under the title and the contents list becomes one scrolling row.

Each incident page tells programs where its plain-text version is: a `<link rel="alternate" type="text/markdown">` in the head, an HTML comment at the top of the body, and a line at the foot of the report. The page itself does not link to the data files; the Markdown version does.

## partials/head.html

Shared `<head>` snippet inserted verbatim into every generated page. It holds the Google Tag Manager loader for container `GTM-M6WWGDJ5`. Edit it here, not in the generated HTML.

## Page scripts

Two small inline scripts, both optional: one applies a stored light or dark choice before the page paints, the other wires up the theme toggle, opens a collapsed row when a link points at it, and marks the section being read in an incident page's contents list. With JavaScript off the toggle stays hidden, the page follows the system theme, and everything is readable.

## Not built yet

- A link checker and Markdown lint (operations manual 7.1, items 5 and 8).
- A GitHub Action that runs `validate.mjs` on every push.
