# For agents working in this repository

This is the site repository for isitahack.com: public-source fact-checks of security news. AI agents research and label; a person decides only the final verdict. Pushing to `main` publishes the site: GitHub runs the check, builds the pages and deploys them.

## Read first

1. `format/README.md`: how an incident is stored, and where each kind of information goes.
2. `format/incident.schema.json` and `format/tables.schema.json`: what every field is for.
3. `format/sample/`: a small made-up incident to copy the layout from.
4. The operations manual (private repository `isitahack-ops`, `MANUAL.md`), sections 1, 2 and 4, if you have access. Its standing rules override everything here.

## The rules that matter most

- **Edit data, never pages.** An incident is the folder `data/incidents/<slug>/`. The pages (`incidents/<slug>.html`, `incidents/<slug>.md`, `index.html`, `status.html`, `sitemap.xml`, `index.json`) are built from it when the site is published and are not in this repository. Never commit one: the check fails if a built page is in a commit.
- **Run one command before you hand off:** `node scripts/check.mjs`. It validates every incident, tests the checks and builds the whole site into `_site/` so you can open your page and read it. Commit only the data you changed (and `llms.txt` for a new incident). `_site/` is never committed.
- **A failed check is never bypassed.** Do not edit, skip or delete a check or a test to get a pass. Report the failure.
- **No source, no claim.** Every claim cites a source row. Confirmed needs an official (Tier 1) source, or two Tier 2/3 sources that did their own reporting. A post on a social platform is Tier 4 or 5, whoever posted it.
- **The verdict is not yours.** Never set `verdict`, never set `status` to `closed`, and never write a likely verdict anywhere ("Confirmed not a hack candidate"). Only the site's owner decides.
- **Resolved means over and quiet, and it is the Editor-in-Chief's to set.** A story is `resolved` only when nothing is still down (`service` absent or `back`), it has had no update for seven days across at least two checks, and no dated promise (a report, a review, a shutdown) is still ahead. The check fails a story marked resolved before that. If you file an update (`added`, `updated`, `label_change`, `correction`) on a resolved story, or mark something down again, set `status` back to `monitoring` in the same change. A research agent never sets `resolved`: when a story qualifies, say so in your log row's summary.
- **Public sources only.** Nothing behind a login. No personal information, social handles, email addresses, phone numbers or usernames in any text.
- **Change only the rows that need it.** Never renumber or reuse an id. Never delete a published claim: relabel it and say why.
- **Every run adds a row at the top of `update_log.csv`**, with a headline about the incident, not about the run. Use `presentation` for a change to wording or headings that leaves every finding as it was.
- **An update has to change something.** A row filed as `added`, `updated` or `label_change` must name, in `claim_ids`, a claim your change added or altered, or one that a question you answered rests on. The check compares your branch with `main` and fails otherwise. If the run added no source and changed no claim, the row is `checked_no_change`, however many outlets now repeat what the story says.
- **Work the overdue stories first.** The site works out when each story is next due a check (hourly while something is down in a story's first three days and daily while it stays down after that; otherwise daily for its first three days, then every three days, weekly once resolved). `https://isitahack.com/index.json` lists `next_check_due` for every story, and the status board marks what is overdue.
- **Give every incident a `subject`** (its short name and kind). The build draws the incident's picture from it. You may add a photograph as `lead_image` if it is public domain, licensed for reuse or the desk's own work, with its credit. Where no usable photograph exists, the owner has approved showing the subject's own logo (or the state seal) as the `lead_image` with `rights: "logo"`, on a plain background, captioned "used for identification; not affiliated" and linked to its official or Wikimedia Commons source. Never use an AI-generated image, and never a picture that suggests an answer (hooded figures, padlocks, code).
- **Say what kind of incident it is and which plain answer it has.** `incident_type` is outage, breach or attack, chosen by what happened, not by the suspected cause. `answer_group` files the incident under one of the home page's four plain answers: `unclear`, `hack-stated` (the organisation or an official source says someone got in; the main question must be Confirmed), `hack-reported` (news reports only; the main question must be Reported) or `no-sign-of-hack` (the organisation says it was not an attack, or the claim was shown false; the main question must be Reported or Confirmed). It restates the main answer and is not a verdict: update it in the same change whenever the main answer changes, and when in doubt use `unclear`.
- **A main answer has one of three labels: Confirmed, Reported or Not established.** The label says how well the answer you show is supported, whichever way it points. An organisation's word alone is Reported; Confirmed needs an official or independent source besides; Not established goes with `unclear`. Unverified, Rumor and Debunked are for claims only.
- **If something went down, say whether it is back.** `service` holds a `state` (`down`, `partly-back`, `back`) and the `claim_id` of the Confirmed or Reported claim that says so. Re-check it on every run and keep that claim's `last_checked` current: the site shows "Down at our last check" with that time. Leave it out when nothing went down or no claim says how things stand; never guess.
- **List new files in `llms.txt`** in the same change. The build stops if an incident's files are missing from it.

## Being found

The main question (the row `main_question_id` points at) is the page title and main heading. Write it the way a person would type it into a search box, naming the subject: "Was the FAA ground stop a cyberattack?", never "Was it a hack?". Keep it within 70 characters. Put other names people use for the incident in `also_called`. Word section titles as the plain questions a reader has ("What caused it?", "What has been ruled out?"). Do not stuff keywords anywhere: one clear question, one clear answer.

## Handing off

Work on a branch named `incident/<slug>` and push it. The check runs on every push and on every pull request. The Editor-in-Chief reviews the branch against the operations manual and merges it to `main`. Do not push to `main` yourself unless that is your assigned role.

## Layout

- `data/incidents/<slug>/`: the incident's data (source of truth).
- `format/`: the format guide, the two schemas and the sample.
- `scripts/`: `validate.mjs`, `build.mjs`, `check.mjs`, and the tests in `scripts/tests/`. Plain Node 22, no dependencies, no install step.
- `pages/`, `assets/`: the hand-written pages and the stylesheet.
- `_site/`: the built site, made by the check and by GitHub when it publishes. Not in the repository.
- Everything else at the root is site configuration (`robots.txt`, `llms.txt`, `CNAME`).
