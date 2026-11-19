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
| A reference table with no labels (who runs what) | `tables/<id>.csv` plus an entry in `incident.json` `tables` |
| Background that is none of the above | `notes/<name>.md` |
| A check you ran, whatever it found | `update_log.csv` |

If something carries a label, it is a claim. Do not put labelled statements in a note or an extra table.

## What the top of the page is built from

| On the page | Comes from |
|---|---|
| The question and short answer | The `questions.csv` row named by `main_question_id` |
| The latest | The newest `update_log.csv` row that is not `checked_no_change`: its `headline` and `logged_at` |
| Known so far | `incident.json` `known`; each item must rest on a Confirmed claim |
| Not known yet | `incident.json` `not_known` |
| Size and who is affected | `incident.json` `size`, `size_basis`, `who_is_affected` |
| At a glance | `incident.json` `figures` |
| Final verdict | `incident.json` `verdict`, only after the owner approves it |

## Never written by hand

The build works these out, so they cannot drift: last-updated and last-checked times, label counts, row counts, the source list, the entry in `index.json`, and the `.md` and `.html` pages. `llms.txt` is still edited by hand; the build warns when it does not list an incident's files.

## When something was never recorded

Leave it empty; never guess. A source's `source_date` may be empty when the source does not state one. `retrieved_at` is required only when the link could be read (`link_status` ok or archived); a site that blocks automated access is `blocked` and the page says it was not re-read. A claim's `last_checked` may be empty only for a claim carried over from before the format. A timeline event may carry a date alone, an `approximate` time, or a short `time_text` such as "Before 3:54 PM". The update-log author `Desk` is only for entries made before roles were recorded.

## Two kinds of Confirmed

A claim is labelled Confirmed by the agents when it meets the evidence bar. The verdict on a whole incident (`verdict`: Confirmed hack or Confirmed not a hack) is different: it needs the owner's personal approval, recorded in `verdict_approved_at`, and setting it closes the case.

## Charts

A chart is a CSV of numbers plus a short description in `incident.json`: its type (`line` or `bar`), which column is the horizontal axis, which columns are the series, the unit, where the numbers came from, and an `alt` sentence that states the trend in words. The build draws the chart and prints the same numbers as a table under it. Agents never draw a chart or save a picture of one. All series on one chart share one scale, so they must be the same kind of quantity; two different quantities need two charts.

## Images

Allowed: images the desk made (`own`), public-domain works such as US federal government material (`public-domain`), and images whose licence allows reuse (`licensed`, with the licence named in `credit`). News photos and screenshots of other people's articles are not allowed. Every image needs a title, `alt` text, a credit, its pixel size and its SHA-256. No faces or names of private people.

## Checking your work

```sh
node scripts/validate.mjs data/incidents/<slug>
```

Run it before every push. It checks:

- every field's type, allowed values and length against the two schema files, and rejects unknown fields;
- CSV headers, exact and in order; UTF-8, LF line endings, no blank rows;
- dates and times, which must carry a timezone offset;
- every id reference (claim to source, event to claim, answer to claim, section to chart, and so on);
- the Confirmed rule: a Tier 1 source, or two Tier 2/3 sources with different `independence_group` values;
- that `known` items rest on Confirmed claims;
- that an answered question has an answer, a label and its claims, and an open one says what would settle it;
- that a verdict has an approval time and a closed status, and a closed incident has a verdict;
- that the update log is newest first;
- that chart columns exist and hold numbers, image files exist and match their SHA-256, and SVGs contain no scripts;
- the privacy rule: no handles or email addresses in any text.

A failed check is never bypassed (operations manual 7.3). The build runs the same checks and stops on any problem.

## Not done yet

- No link checker or Markdown lint (operations manual 7.1, items 5 and 8).
