# scripts

## build.mjs

Renders the site. Plain Node (tested on Node 24), zero dependencies, no framework, bundler or client-side JavaScript (the only script tags are the Google Tag Manager partial below).

```sh
node scripts/build.mjs
```

What it does:

1. Reads every `incidents/*.md`, parses the YAML front-matter (`slug`, `title`, `status`, `incident_date`, `last_updated`, `labels_summary`, `disclaimer`, ...) and checks that `slug` matches the filename.
2. Renders the Markdown body to `incidents/<slug>.html`, next to the `.md`:
   - a status banner (front-matter `status` and `last_updated`), the page title, and the label tally from `labels_summary`;
   - the body's callouts (the "Not verified" disclaimer is kept word for word), a table of contents, then one section per `##` heading, in file order;
   - table cells whose whole text is one of the six labels (Confirmed, Reported, Unverified, Rumor, Debunked, Not established) become text pills with distinct colors and border styles;
   - every link (Markdown links and bare URLs) becomes `<a href="..." rel="noopener">`, opening in the same tab; only http(s) URLs are linked;
   - pipe tables reflow into cards on phones and become scrollable tables from 760px wide;
   - the footer carries the front-matter `disclaimer` and links to the `.md`, the raw data, `index.json` and `llms.txt`.
3. Regenerates `index.html` from the incidents' front-matter, newest `last_updated` first.
4. Updates `index.json`: keeps existing fields, refreshes `title`, `status`, `last_updated`, and adds `files.html`.
5. Warns (does not fail) when `llms.txt` does not list an incident's `.md` and `.html`, when the body's "Last updated" date differs from front-matter, or when a table cell holds a raw label code (`C`, `R`, `D`).

All content is HTML-escaped. The build reads no clock, locale or environment, so the same input produces byte-identical output. Unsupported Markdown is rendered as escaped text, never dropped. A table row with the wrong number of cells fails the build.

The Markdown subset supported: `#`–`######` headings, paragraphs, pipe tables, `>` blockquotes (a final `> — Name` line makes an attributed quote, a leading `**Lead**` makes a callout), `-` lists and `- [ ]`/`- [x]` task lists, `[text](url)`, bare URLs, `**bold**`, `` `code` ``, and fenced code blocks.

## partials/head.html

Shared `<head>` snippet inserted verbatim into every generated page (incident pages and `index.html`). It holds the Google Tag Manager loader for container `GTM-M6WWGDJ5`. Edit it here, not in the generated HTML.

## Styling

`assets/site.css`: one shared, mobile-first stylesheet with system fonts and light/dark themes via `prefers-color-scheme`. No external fonts or CDNs.

## Not built yet

`scripts/validate` (operations manual, section 7) is not built yet.
