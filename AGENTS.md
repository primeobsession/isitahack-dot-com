# For agents working in this repository

This is the site repository for isitahack.com: public-source fact-checks of security news. AI agents research and label; a person decides only the final verdict. Pushing to `main` publishes the site.

## Read first

1. `format/README.md`: how an incident is stored, and where each kind of information goes.
2. `format/incident.schema.json` and `format/tables.schema.json`: what every field is for.
3. `format/sample/`: a small made-up incident to copy the layout from.
4. The operations manual (private repository `isitahack-ops`, `MANUAL.md`), sections 1, 2 and 4, if you have access. Its standing rules override everything here.

## The rules that matter most

- **Edit data, never pages.** An incident is the folder `data/incidents/<slug>/`. The files `incidents/<slug>.html`, `incidents/<slug>.md`, `index.html`, `sitemap.xml` and `index.json` are built from it. A built page edited by hand fails the check.
- **Run one command before you hand off:** `node scripts/check.mjs`. It validates every incident, tests the checks, rebuilds the site and tells you what to commit. Commit the data and the rebuilt pages together.
- **A failed check is never bypassed.** Do not edit, skip or delete a check or a test to get a pass. Report the failure.
- **No source, no claim.** Every claim cites a source row. Confirmed needs an official (Tier 1) source, or two Tier 2/3 sources that did their own reporting. A post on a social platform is Tier 4 or 5, whoever posted it.
- **The verdict is not yours.** Never set `verdict`, never set `status` to `closed`, and never write a likely verdict anywhere ("Confirmed not a hack candidate"). Only the site's owner decides.
- **Public sources only.** Nothing behind a login. No personal information, social handles, email addresses, phone numbers or usernames in any text.
- **Change only the rows that need it.** Never renumber or reuse an id. Never delete a published claim: relabel it and say why.
- **Every run adds a row at the top of `update_log.csv`**, with a headline about the incident, not about the run. Use `presentation` for a change to wording or headings that leaves every finding as it was.
- **Give every incident a `subject`** (its short name and kind). The build draws the incident's picture from it. You may add a photograph as `lead_image` if it is public domain, licensed for reuse or the desk's own work, with its credit. Where no usable photograph exists, the owner has approved showing the subject's own logo (or the state seal) as the `lead_image` with `rights: "logo"`, on a plain background, captioned "used for identification; not affiliated" and linked to its official or Wikimedia Commons source. Never use an AI-generated image, and never a picture that suggests an answer (hooded figures, padlocks, code).
- **Say what kind of incident it is and which plain answer it has.** `incident_type` is outage, breach or attack, chosen by what happened, not by the suspected cause. `answer_group` files the incident under one of the home page's four plain answers: `unclear`, `hack-stated` (the organisation or an official source says someone got in; the main question must be Confirmed), `hack-reported` (news reports only; the main question must be Reported) or `no-sign-of-hack` (the organisation says it was not an attack, or the claim was shown false). It restates the main answer and is not a verdict: update it in the same change whenever the main answer changes, and when in doubt use `unclear`.
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
- Everything else at the root is built output or site configuration (`robots.txt`, `llms.txt`, `CNAME`).
