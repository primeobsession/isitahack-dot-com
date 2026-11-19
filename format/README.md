# Incident format

**Status: draft for Justin's approval.** This replaces the hand-written Markdown page as the source of truth. A change to the schema is a major change (operations manual 5.2).

An incident is a folder of typed data. Agents edit the data; the build writes the page. Nobody edits the page.

## The folder

```
data/incidents/<slug>/
  incident.json      the head: what it is, its size, the short summary, the section order
  claims.csv         every labelled claim
  sources.csv        every source
  timeline.csv       dated events
  questions.csv      questions people are asking, and rumors, with their answers
  quotes.csv         statements quoted word for word (optional)
  update_log.csv     every check and change, newest first
  charts/<id>.csv    the numbers behind one chart
  tables/<id>.csv    an extra table that fits none of the files above
  images/<name>      image files
  notes/<name>.md    free narrative, used sparingly
  raw/               preserved source material (unchanged from today)
```

The build writes `incidents/<slug>.html` and `incidents/<slug>.md` from this folder. Both are outputs.

## Where the field definitions are

- `format/incident.schema.json` defines `incident.json` (JSON Schema).
- `format/tables.schema.json` defines every CSV column (Frictionless Table Schema vocabulary).

Each field has a `description` saying what it is for. Those two files are the field reference; this page does not repeat them. `format/sample/` holds a small made-up incident that passes every check.

## Where does this go?

| You have | Put it in |
|---|---|
| A statement that could be true or false, with a source | `claims.csv`, with a `group` |
| Something that happened at a time | `timeline.csv`, pointing at its claim |
| A question or rumor readers are asking | `questions.csv` |
| Someone's exact words | `quotes.csv` |
| A number that changes over time, or a comparison | `charts/<id>.csv` plus an entry in `incident.json` `charts` |
| A key number or time for the top of the page | `incident.json` `figures` |
| A picture or diagram | `images/` plus an entry in `incident.json` `images` |
| Who or what the incident is about | `incident.json` `subject` (the build draws the incident's picture from it) |
| A reference table with no labels (who runs what) | `tables/<id>.csv` plus an entry in `incident.json` `tables` |
| Background that is none of the above | `notes/<name>.md` |
| A check you ran, whatever it found | `update_log.csv` |

If something carries a label, it is a claim. Do not put labelled statements in a note or an extra table.

## What the top of the page is built from

| On the page | Comes from |
|---|---|
| The page title, the main heading and the short answer | The `questions.csv` row named by `main_question_id` |
| "Also reported as…" under the heading | `incident.json` `also_called` |
| The incident's name in lists and breadcrumbs | `incident.json` `title` |
| The latest | The newest `update_log.csv` row that changed a finding (not `checked_no_change`, not `presentation`): its `headline` and `logged_at` |
| First published, last updated | The oldest `update_log.csv` row, and the newest one that changed a finding |
| Known so far | `incident.json` `known`; each item must rest on a Confirmed claim |
| Not known yet | `incident.json` `not_known` |
| Size and who is affected | `incident.json` `size`, `size_basis`, `who_is_affected` |
| At a glance | `incident.json` `figures` |
| Final verdict | `incident.json` `verdict`, only after the owner approves it |

## Being found

People type a question into a search box or ask an AI assistant: "is the FAA outage a hack?". The page has to be the obvious answer to that question without reading like bait.

- **The main question is the page title and the main heading.** Write it the way a person would ask it, naming the subject: "Was the FAA ground stop a cyberattack?". Never "Was it a hack?", which means nothing in a list of search results. Keep it within 70 characters and end it with a question mark.
- **Its answer is the first thing on the page.** Lead with the answer in plain words; one or two calm sentences.
- **`title` is the incident's plain name** ("FAA nationwide ground stop"). It appears in lists and breadcrumbs.
- **`also_called` holds up to three other names really in use** ("the FAA outage"), each written to follow "Also reported as". It is shown once, under the heading.
- **Section titles are the questions a reader has**: "What caused it?", "What has been ruled out?", "What officials have said". Not desk shorthand.
- **No keyword lists, anywhere.** One clear question, one clear answer, plain names. Search engines treat stuffing as spam, and readers notice.

The build adds the rest: the canonical address, the description, the share image, the dates and the structured data that search engines read. All of it restates what the page shows.

## Never written by hand

The build works these out, so they cannot drift: the page title, first-published, last-updated and last-checked times, label counts, row counts, the source list, `sitemap.xml`, the entry in `index.json`, and the `.md` and `.html` pages. `llms.txt` is still edited by hand; the build stops when it does not list an incident's files.

## When something was never recorded

Leave it empty; never guess. A source's `source_date` may be empty when the source does not state one. `retrieved_at` is required only when the link could be read (`link_status` ok or archived); a site that blocks automated access is `blocked` and the page says it was not re-read. A claim's `last_checked` may be empty only for a claim carried over from before the format. A timeline event may carry a date alone, an `approximate` time, or a short `time_text` such as "Before 3:54 PM". The update-log author `Desk` is only for entries made before roles were recorded.

## Two kinds of Confirmed

A claim is labelled Confirmed by the agents when it meets the evidence bar. The verdict on a whole incident (`verdict`: Confirmed hack or Confirmed not a hack) is different: it needs the owner's personal approval, recorded in `verdict_approved_at`, and setting it closes the case.

## Charts

A chart is a CSV of numbers plus a short description in `incident.json`: its type (`line` or `bar`), which column is the horizontal axis, which columns are the series, the unit, where the numbers came from, and an `alt` sentence that states the trend in words. The build draws the chart and prints the same numbers as a table under it. Agents never draw a chart or save a picture of one. All series on one chart share one scale, so they must be the same kind of quantity; two different quantities need two charts.

## The incident's picture

Every incident has a picture: on the home page, at the top of its page, and (when it is a photograph) on shared links.

- **Always: `subject`.** Give the short name people know the subject by (`"FAA"`, `"Apple"`, `"Microsoft 365"`) and its `kind` (aviation, online-service, devices, finance, government, telecom, energy, health, network, other). The build draws the picture: the name set in type over a simple drawing for the kind. Choose the kind by what the subject is, not by the suspected cause. That is all a new incident needs.
- **Optional: `lead_image`.** Name an entry in `images` and it takes the drawn picture's place. Use a photograph or illustration that shows the subject plainly: the kind of place or thing involved (an airport control tower, a data centre, a storefront). It must be landscape, at least 1200 pixels wide, a png, jpg or webp, and allowed under the rules below, with its credit.
- **Never a logo or seal.** Company logos and government seals need the owner's permission, and using one suggests the owner endorses the page. The subject's name in plain type says who it is about. A photograph in which a sign or logo happens to be visible is fine if the photograph itself is allowed.
- **Never a picture that takes a side.** No hooded figures, padlocks, skulls or code-rain: the picture must not suggest an answer the evidence has not given. No people's faces.

## Images

Allowed: images the desk made (`own`), public-domain works such as US federal government material (`public-domain`), and images whose licence allows reuse (`licensed`, with the licence named in `credit`). News photos, screenshots of other people's articles, and company or agency logos and seals are not allowed. Every image needs a title, `alt` text, a credit, its pixel size and its SHA-256. No faces or names of private people.

## Checking your work

```sh
node scripts/check.mjs
```

Run it before every hand-off. It validates every incident, runs the tests that prove each rule still works, rebuilds the site and lists what to commit. Commit the data and the rebuilt pages together. The same command runs on GitHub for every push and pull request, where it also fails if the committed pages differ from a fresh build (a page edited by hand, or data changed without a rebuild).

To check one folder while you work: `node scripts/validate.mjs data/incidents/<slug>`. It checks:

- every field's type, allowed values and length against the two schema files, and rejects unknown fields;
- CSV headers, exact and in order; UTF-8, LF line endings, no blank rows;
- dates and times, which must carry a timezone offset;
- every id reference (claim to source, event to claim, answer to claim, section to chart, and so on);
- the Confirmed rule: a Tier 1 source, or two Tier 2/3 sources with different `independence_group` values;
- source tiers: a post on a social platform is Tier 4 or 5, whoever posted it;
- that `known` items rest on Confirmed claims;
- that the main question names its subject, ends with a question mark and fits in a page title;
- that an answered question has an answer, a label and its claims, and an open one says what would settle it;
- that a verdict has an approval time and a closed status, and a closed incident has a verdict;
- that no text uses the words of a final verdict ("Confirmed hack", "Confirmed not a hack") before one is approved;
- that the update log is newest first;
- that chart columns exist and hold numbers, image files exist and match their SHA-256, and SVGs contain no scripts;
- that a `lead_image` is a defined image, landscape, at least 1200 pixels wide and not an SVG;
- the privacy rule: no handles, email addresses, phone numbers or forum usernames in any text, notes included.

A failed check is never bypassed (operations manual 7.3). The build runs the same checks and stops on any problem.

## Not done yet

- No link checker or Markdown lint (operations manual 7.1).
