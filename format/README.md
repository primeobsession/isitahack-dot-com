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
| Whether it is an outage, a breach or an attack | `incident.json` `incident_type`, chosen by what happened, not by the suspected cause |
| Whether the thing that went down is back | `incident.json` `service`: a state (`down`, `partly-back`, `back`) and the Confirmed or Reported claim that says so. Leave it out when nothing went down or no claim says |
| Which plain answer the home page files it under | `incident.json` `answer_group` (see "The home page's four answers") |
| A reference table with no labels (who runs what) | `tables/<id>.csv` plus an entry in `incident.json` `tables` |
| Background that is none of the above | `notes/<name>.md` |
| A check you ran, whatever it found | `update_log.csv` |

If something carries a label, it is a claim. Do not put labelled statements in a note or an extra table.

## What the top of the page is built from

| On the page | Comes from |
|---|---|
| The page title, the main heading and the short answer | The `questions.csv` row named by `main_question_id` |
| What the subject is | `incident.json` `subject.about`, with `subject.about_url` |
| "Also reported as…" under the heading | `incident.json` `also_called` |
| The incident's name in lists and breadcrumbs | `incident.json` `title` |
| The latest | The newest `update_log.csv` row that changed a finding (not `checked_no_change`, not `presentation`): its `headline` and `logged_at` |
| First published, last updated | The oldest `update_log.csv` row, and the newest one that changed a finding |
| Known so far | `incident.json` `known`; each item must rest on a Confirmed claim |
| Not known yet | `incident.json` `not_known` |
| Size and who is affected | `incident.json` `size`, `size_basis`, `who_is_affected` |
| At a glance | `incident.json` `figures` |
| Final verdict | `incident.json` `verdict`, only after the owner approves it |

## The page: one scroll of questions

An incident page is read from top to bottom. It asks the questions a reader has, in the order they have them, and nothing is folded away: someone who wants more scrolls further. You do not place anything: the build puts each part of the data where it belongs.

| The question on the page | What answers it | Comes from |
|---|---|---|
| The main question, at the top | The plain answer, how well it is supported, whether it is still down and how big it is | The main question, `answer_group`, `service`, `size` |
| What is <name>? | One or two sentences on what the subject is, with the page they rest on | `subject.about` and `subject.about_url`. Left out when the incident gives none |
| What happened? | The latest, the key numbers, then the timeline | The newest log row that changed a finding, `figures`, `timeline.csv` |
| Is it still down? | The state and the claim it rests on | `service`. Left out when nothing went down |
| Does it affect me? | Who is affected and what they can do | `who_is_affected` |
| How big is it? | The size and why | `size`, `size_basis` |
| What we know, and what we don't | Two lists | `known`, `not_known` |
| Everything that has been said | Every other section in `sections`, in your order, each claim with its label, its evidence and its sources in view | `sections`, `claims.csv`, `questions.csv` and the rest |
| Where this comes from | Every source | `sources.csv` |
| Every update | The whole update log, newest first | `update_log.csv` |

So write the fields near the top for someone who will stop there: plain words, no source ids, no jargon.

### Say what the subject is

A reader may never have heard of the subject. `subject.about` says what it is in one or two plain sentences: what it is, who runs it, and what people use it for. "FinCEN is the Financial Crimes Enforcement Network, a bureau of the US Treasury. Banks and other businesses file their required reports with it." Write nothing about the incident there, and no opinion. `subject.about_url` is the public page the description rests on, usually the subject's own "about" page; the page links to it. The two go together, and the check fails on one without the other. Every new incident should have them.

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

The build works these out, so they cannot drift: the page title, first-published, last-updated and last-checked times, when the next check is due, label counts, row counts, the source list, `sitemap.xml`, the entry in `index.json`, and the `.md` and `.html` pages. None of these is in the repository: they are built into `_site/` by the check, and by GitHub when the site is published. `llms.txt` is still edited by hand; the build stops when it does not list an incident's files.

## When something was never recorded

Leave it empty; never guess. A source's `source_date` may be empty when the source does not state one. `retrieved_at` is required only when the link could be read (`link_status` ok or archived); a site that blocks automated access is `blocked` and the page says it was not re-read. A claim's `last_checked` may be empty only for a claim carried over from before the format. A timeline event may carry a date alone, an `approximate` time, or a short `time_text` such as "Before 3:54 PM". The update-log author `Desk` is only for entries made before roles were recorded.

## Two kinds of Confirmed

A claim is labelled Confirmed by the agents when it meets the evidence bar. The verdict on a whole incident (`verdict`: Confirmed hack or Confirmed not a hack) is different: it needs the owner's personal approval, recorded in `verdict_approved_at`, and setting it closes the case.

## The home page's four answers

The home page groups incidents by a plain answer, so a reader who knows nothing about labels can see where each one stands. `answer_group` in `incident.json` says which group:

| `answer_group` | The home page says | Use it when | The main question's label |
|---|---|---|---|
| `unclear` | Still unclear | Nobody has shown whether it was an attack | Not established |
| `hack-stated` | Hacked, by its own account | The organisation itself, or an official source, says someone got in | Confirmed |
| `hack-reported` | Reported as a hack | News outlets or a single official say so, and nothing confirms it | Reported |
| `no-sign-of-hack` | No sign of a hack | The organisation says it was not an attack, or the claim of one was shown false | Reported when it rests on the organisation's word alone; Confirmed when an official or independent source backs it |

**A main answer carries one of three labels: Confirmed, Reported or Not established.** The label says how well the answer shown is supported, whichever way the answer points: "Dropbox says it was not an attack" is Reported, because it is Dropbox's word alone. Unverified, Rumor and Debunked are for individual claims, never for the main answer. The validator enforces this. *Decided by the owner, Nov 24, 2026.*

It restates the main question's answer and is not a verdict, so it needs no approval. Change it in the same change as the main answer, never let it say more than the answer does, and when in doubt use `unclear`. Once the owner approves a verdict, it must match it.

`incident_type` (outage, breach or attack) is what readers filter the home page by. Choose by what happened, not by the suspected cause: a service that went down is an outage even if an attack turns out to be behind it.

## The front of the home page

The top of the home page is built from the incidents, with nothing written by hand. It shows the stories that are current, from biggest to smallest, with the newest changes beside them.

- **Which stories.** An incident in `monitoring` is on the front while any of these holds: it happened in the last seven days (`incident_date`), we opened it in the last 48 hours, or `service` says something is still `down` or `partly-back`. An older story with a new update appears in the live updates, not in the bands.
- **The bands.** One per `size`, largest first; "Nation-level potential" sits in the Nation-level band, after the established ones and marked "potential". Within a band the most recently updated comes first.
- **A tile** is the main question, the plain answer in its colour, the main answer's text, the `lead_image` (or the `subject.name` on a plate when there is none), and whether it is new or still down.
- **Live updates** are the newest log rows filed as `added`, `updated`, `label_change` or `correction`, across every story. A story's first row reads "New story". Checks that found nothing are counted, not listed.
- **The clock.** The build has none: "now" is the newest check logged in any incident. Pages print real timestamps, and a few lines of script show them as "6 min ago".

### The Editor-in-Chief's picks: `data/front-page.json`

The one hand-written input, and only the Editor-in-Chief changes it. Every field but `updated` may be left out, and the page builds correctly with every list empty.

| Field | What it does |
|---|---|
| `updated` | When the picks were last reviewed, with its offset. `lead` and `lines` lapse 48 hours after it, so a front page nobody is tending falls back to the rules |
| `lead` | Up to 8 slugs, in order. Each goes first in its own band, and is on the front even if it is older than seven days |
| `keep` | `{ "slug", "until" }`: an older story to keep on the front until that day |
| `hold` | `{ "slug", "until", "reason" }`: a story to leave off the front until that day. It stays in the full list and on its own page |
| `lines` | `{ "slug", "text" }`: one sentence, at most 160 characters, shown on that story's tile in place of the main answer's text |

`until` is a day and at most 14 days after `updated`; renew it if it is still needed. A pick never changes a story: the size, the answer and every fact still come from the incident's data. A line follows the same rules as any story text: plain, calm, no verdict words, nothing about the desk. The build stops if the file names an incident that does not exist, picks and holds the same story, or breaks a limit.

## Is it back?

When something stopped working, readers ask whether it is back. `service` in `incident.json` answers that: a `state` and the `claim_id` of the claim that says so.

- `down`: the service, or the part that failed, was still out at the last check. `partly-back`: some of it is restored and some is not. `back`: it is working again.
- The claim must be labelled Confirmed or Reported. The page and the status board show the state, the claim's own text and when that claim was last checked, so keep the claim's `last_checked` current.
- Re-check it on every run, and change it in the same change as the claim. A "down" that is no longer true is the most misleading thing the site can say.
- Leave `service` out when nothing went down, or when no claim says how things stand. Never guess it from a tracker graph or from silence.

## An update has to change something

A log row filed as `added`, `updated` or `label_change` moves the page's "Last updated" time and becomes "The latest" at the top of the page. So it must name, in `claim_ids`, at least one claim that the same change added or altered, or that a question the change answered or relabelled rests on. The check compares your branch with `main` and refuses a new row that does not.

- A run that added no source and changed no claim is a check: file it as `checked_no_change`. Another outlet repeating what the story already says is not an update. Moving a claim's `last_checked` is not one either.
- A `checked_no_change` row still gets a headline a reader can use: "Next has still not named the supplier", not "Morning check".
- Only rows that are not on `main` yet are judged. Rows already published stay as they were filed.

## When the next check is due

The build works out when each story is next due a check, from the cadence the owner decided (Nov 24, 2026): every hour while `service` is `down` or `partly-back` during a story's first three days, and once a day while it is still down after that; otherwise once a day for a story's first three days; every three days until it is resolved; weekly once `status` is `resolved`. A closed story is not checked again. The three days are counted from the day the story was first published. An hourly check is due an hour after the last one; the others are due by the end of the day.

"Last checked" is the newest log row that is not `presentation`, so every run must add its row, even an empty one. The due time is on the story's page, in its Markdown version, on the status board (which marks what is overdue and can list the most overdue first) and in `index.json` as `last_checked`, `check_every` and `next_check_due`. Nothing is written by hand.

## When a story is resolved

`status` is `monitoring`, `resolved` or `closed`. Resolved means the event is over and the story has gone quiet, but the final answer is not settled. It is not a verdict and it does not mean the main question is answered. Adopted by the owner on Nov 25, 2026. A story is resolved when all three hold:

1. **Nothing is still down.** There is no `service`, or its state is `back`.
2. **It has gone quiet.** No update for seven days, across at least two checks in that time. An update is a log row filed as `added`, `updated`, `label_change` or `correction`. A check is any row that is not `presentation`.
3. **No dated promise is still ahead.** Nobody has promised a report, a review or a shutdown with a date that has not passed.

A resolved story goes back to `monitoring` in the same change that files a new update or marks something down again. It can be resolved again after another seven quiet days.

The Editor-in-Chief sets `resolved`; the owner's approval is not needed. A research agent does not set it: when a story qualifies, say so in the summary of the check's log row. `closed` needs an approved verdict and is the owner's alone.

The validator checks the first two from the story's own files, so it fails a story marked resolved too early and fails an update that leaves a story resolved. The third is a judgement: read what each open question says would settle it.

## Charts

A chart is a CSV of numbers plus a short description in `incident.json`: its type (`line` or `bar`), which column is the horizontal axis, which columns are the series, the unit, where the numbers came from, and an `alt` sentence that states the trend in words. The build draws the chart and prints the same numbers as a table under it. Agents never draw a chart or save a picture of one. All series on one chart share one scale, so they must be the same kind of quantity; two different quantities need two charts.

## The incident's picture

Every incident has a picture: on the home page, at the top of its page, and (when it is a photograph) on shared links.

- **Always: `subject`.** Give the short name people know the subject by (`"FAA"`, `"Apple"`, `"Microsoft 365"`) and its `kind` (aviation, online-service, devices, finance, government, telecom, energy, health, network, other). The build draws the picture: the name set in type over a simple drawing for the kind. Choose the kind by what the subject is, not by the suspected cause. That is all a new incident needs.
- **A photograph: `lead_image`, expected on every incident.** *Checked for incidents opened on or after Nov 26, 2026:* the check fails unless the incident has a `lead_image`, or says in `no_photo` where the desk looked and why nothing could be used. An older incident without one gets it at its next check. Name an entry in `images` and it takes the drawn picture's place. Use a photograph or illustration that shows the subject plainly: the kind of place or thing involved (an airport control tower, a data centre, a storefront). It must be landscape, at least 1200 pixels wide, a png, jpg or webp, and allowed under the rules below. Give it a `caption` saying what it shows, a `credit` naming the maker and the licence ("Jeffrey Beall, CC BY 4.0, via Wikimedia Commons"), and `source_url`, the page it came from. If the photograph is not of a place or thing in the story, the caption must say so ("not involved in this incident").
- **Next best: a screenshot of the organisation's own notice.** *Allowed from Nov 25, 2026.* When no usable photograph exists, the picture may be the desk's own screenshot of the page the organisation published about the incident (its notice, status page or blog post), with `rights: "screenshot"` and `source_id` naming that page, which must be a Tier 1 source in `sources.csv`. It reports what the organisation said, so it is the page the story rests on, never a news article or someone else's post. Take it 1600 pixels wide, crop it to the page's header and title, and crop out anything personal and any contact addresses. Caption it "Screenshot of <organisation>'s notice, <date>" and credit "<organisation>, screenshot by isitahack.com". If the organisation has no page about the incident, its home page will do.
- **A logo or seal only as a last resort.** Prefer a photograph. When no usable photograph exists, the incident's picture may be the subject's own logo or a state seal (`rights: "logo"`), taken from the owner's own public site or Wikimedia Commons, set whole on a plain background, with a caption "used for identification; not affiliated with isitahack.com" and a credit that links the source. It is a trademark or seal shown to say who the page is about, not a sign of endorsement. Never an AI-generated image. A photograph in which a sign or logo happens to be visible is fine if the photograph itself is allowed.
- **A small copy beside it.** Save the lead picture a second time, 800 pixels wide, as `images/<name>.small.<ext>` next to the original (`water-tower.small.png` beside `water-tower.png`). The home page cards and the top of the story page show the small copy; shared links keep the original. From Wikimedia Commons, ask the API for both widths (`iiurlwidth=1920` and `iiurlwidth=800`) and download each `thumburl`. It needs no entry in `images`. Without it the pages fall back to the full-size file and the build prints a warning, because a phone then downloads several hundred kilobytes it does not need.
- **Never a picture that takes a side.** No hooded figures, padlocks, skulls or code-rain: the picture must not suggest an answer the evidence has not given. No people's faces.

## Images

Allowed: images the desk made (`own`), public-domain works such as US federal government material (`public-domain`), and images whose licence allows reuse (`licensed`, with the licence named in `credit`). News photos, screenshots of other people's articles, and logos and seals are not allowed except as the last-resort `logo` picture above. Every image needs a title, `alt` text, a credit, its pixel size and its SHA-256. Unless it is the desk's own work, it also says where it came from: `source_id` when that is one of the incident's sources, otherwise `source_url`. No faces or names of private people.

## Checking your work

```sh
node scripts/check.mjs
```

Run it before every hand-off. It validates every incident, runs the tests that prove each rule still works, compares your new log rows with `main` (an update has to change something), and builds the whole site into `_site/`, where you can open your page. Commit the data you changed, and `llms.txt` for a new incident; never a built page. The same command runs on GitHub for every push and pull request, and again when the site is published, where a failure means nothing is published.

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
- that a resolved story has nothing still down and has had no update for seven days across at least two checks;
- that no text uses the words of a final verdict ("Confirmed hack", "Confirmed not a hack") before one is approved;
- that `service`, when present, rests on a Confirmed or Reported claim;
- that the main question is labelled Confirmed, Reported or Not established, that `answer_group` agrees with that label, and that it matches the verdict once there is one;
- that the update log is newest first;
- that chart columns exist and hold numbers, image files exist and match their SHA-256, and SVGs contain no scripts;
- that a `lead_image` is a defined image, landscape, at least 1200 pixels wide and not an SVG;
- the privacy rule: no handles, email addresses, phone numbers or forum usernames in any text, notes included.

A failed check is never bypassed (operations manual 7.3). The build runs the same checks and stops on any problem.

## Not done yet

- No link checker or Markdown lint (operations manual 7.1).
