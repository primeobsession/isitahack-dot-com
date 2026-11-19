---
slug: 2026-11-microsoft-365-outage
title: "Microsoft 365 Outage, Nov 12-13, 2026: Was It a Hack?"
status: monitoring
incident_date: 2026-11-12
last_updated: 2026-11-18T21:30:00-05:00
labels_summary:
  Confirmed: 12
  Reported: 2
  Unverified: 0
  Rumor: 1
  Debunked: 2
  Not established: 1
labels_summary_basis: claims.csv, 18 claim rows
data_dir: data/incidents/2026-11-microsoft-365-outage
disclaimer: Made for entertainment using AI. Not endorsed by Microsoft, any government agency, news outlet, company, or anyone else named.
---

> **STATUS: MONITORING.** Microsoft 365 has been back to normal since Nov 13. The case stays open until Microsoft's final post-incident report (due Nov 20, 2026) and the decision on the final verdict by isitahack.com's CEO. As of 9:30 PM ET Wed Nov 18, 2026, the final report has not been published.

# Microsoft 365 Outage, Nov 12-13, 2026: Was It a Hack?

From late Thursday morning, Nov 12, 2026, until late Friday morning, Nov 13, most Microsoft 365 users worldwide could not get into Outlook and Exchange Online email. Parts of Teams, Copilot, SharePoint and OneDrive that rely on Exchange were also affected. This page answers the question people asked: was it a hack? All times are Eastern. Last updated 9:30 PM ET, Nov 18, 2026; see the update log near the end.

> **Not verified: initial investigation only.** Nothing on this page is absolutely confirmed. It is an early look based only on publicly available sources, and it should not be treated as verified fact. Even items labeled "Confirmed" only mean that an official source states them or two independent public sources report them. This analysis was put together for entertainment purposes using AI. It is not endorsed by, affiliated with, or reviewed by Microsoft, any government agency, news outlet, company, or anyone else named here.

## Was this a hack?

**Short answer: all the public evidence says no, though the site's final verdict is still pending (see below).** Microsoft says it was a technical failure: a months-old software defect that a surge in traffic set off. Microsoft says it was not related to cyber activity. The US government said on Nov 18 that it was not a cyberattack. A separate phishing scam did exploit the outage afterwards, but it did not cause it.

| Question | Answer | Label |
|---|---|---|
| Was there a global Microsoft 365 outage on Nov 12 to 13? | Yes, about 24 hours, per Microsoft's own report. | Confirmed |
| What caused it, according to Microsoft? | A latent defect from a July update, extra load from a Teams failover, and reduced capacity, all at once. | Confirmed |
| Was it a cyberattack, hack or DDoS? | Microsoft and the US government both say no. | Debunked |
| Was it caused by AI-written code or AI agents? | Microsoft says no. No one else has addressed it. | Rumor |
| Was it part of a coordinated attack with the FAA and bank outages? | The US government says the incidents are unrelated. | Debunked |
| Did criminals try to exploit it? | Yes, with phishing emails posing as outage notices. That was separate from the cause. | Confirmed |
| Was there a major Azure outage on Nov 18? | We found none. | Not established |

**Preliminary read, awaiting the CEO's decision:** this looks like a strong "Confirmed not a hack" candidate. That final verdict is not applied. Under the site's rules only isitahack.com's CEO can apply it, after reviewing the evidence. We also want to read Microsoft's final post-incident report, due Nov 20, before it is decided.

## Size

**Size: Large, global.** This is actual impact, not potential. Exchange Online email is a service many organizations and governments rely on every day. Microsoft says most Exchange Online users were affected for about 24 hours, and BBC News reports problems in at least 70 countries. This was a service outage, not a breach. No source reports that data was exposed.

## What we know

- Exchange Online and Outlook were down for most users from 11:20 AM ET Nov 12 to 11:10 AM ET Nov 13, per Microsoft (Confirmed).
- Microsoft's preliminary report blames a latent defect from a July update to its networking gateway servers, set off by extra traffic and reduced capacity (Confirmed as Microsoft's finding).
- Microsoft says the outage was not related to cyber activity or to AI or agents (Confirmed that Microsoft said this).
- The White House says none of the week's outages was a cyberattack, and that they are unrelated to each other (Confirmed that it said this).
- A phishing campaign posing as outage notices followed the outage (Confirmed).

## What we don't know

- What Microsoft's final post-incident report will add. It is due Nov 20, 2026.
- Exactly how many users and organizations were affected.
- Why the safeguards between regions failed. Microsoft says only that "a separate issue" let the failure spread.
- Whether the phishing campaign stole any credentials. Microsoft says this has not been confirmed.

## Who was affected and what to do

- Most Microsoft 365 business, school and government users who rely on Exchange Online or Outlook for email, worldwide. Microsoft extended its email timeout to 48 hours so mail delayed during the outage would still be delivered.
- People using Teams, Copilot, SharePoint or OneDrive features that depend on Exchange.
- Be wary of emails about the outage that ask you to click to "restore" held messages. Microsoft warned of phishing emails doing exactly that. Microsoft advises checking service problems directly in the Microsoft 365 admin center.

## No Azure outage found on Nov 18

People were also asking about a Microsoft Azure incident around Wednesday, Nov 18. We checked and found none. Microsoft's Azure status page showed no active events, Azure's status history lists no incident review newer than Sep 30, 2026, and no outlet we found reported a major Azure outage that day. Third-party trackers showed only scattered user reports. The Microsoft outage people were discussing that week appears to be this one, the Nov 12 to 13 Microsoft 365 outage.

## Latest update

Wednesday, Nov 18: the White House published statements from the Director of National Intelligence and the Secretary of State saying the recent outages, including Microsoft's, were not a cyberattack and are unrelated to each other. Microsoft's final post-incident report is still due Nov 20.

## Claims

Every claim carries a source and a note on why that source supports it. The same rows are in `claims.csv`, with the second sources listed in `sources.csv`.

| ID | Claim | Label | Source | Why it supports |
|---|---|---|---|---|
| c001 | Microsoft puts the outage window at 4:20 PM UTC on Thursday, Nov 12 (11:20 AM ET) to 4:10 PM UTC on Friday, Nov 13 (11:10 AM ET), under incident IDs EX1550543 and MO1550821. | Confirmed | [Microsoft Preliminary Post Incident Report EX1550543/MO1550821 (third-party copy hosted by opensecurity.es)](https://www.opensecurity.es/wp-content/uploads/2026/11/PostIncidentReport.pdf) | Microsoft's preliminary post-incident report gives these incident start and end times. |
| c002 | Microsoft first posted about Teams problems in North America at 10:40 AM ET on Nov 12, and about Exchange Online mailbox access problems in the Americas at 12:54 PM ET. | Confirmed | [Microsoft 365 Status (official X account)](https://x.com/i/status/2120904489209143320) | Microsoft's official status account posted the Teams investigation notice at this time. |
| c003 | Exchange Online took the main hit: most users could not reach their mailboxes through Outlook or other mail apps, and email delivery was delayed. Parts of Copilot, Teams, SharePoint, OneDrive, Defender and Purview that rely on Exchange Online were also affected. | Confirmed | [Microsoft Preliminary Post Incident Report EX1550543/MO1550821 (third-party copy hosted by opensecurity.es)](https://www.opensecurity.es/wp-content/uploads/2026/11/PostIncidentReport.pdf) | The report's User Impact section describes the primary and secondary impact in these terms. |
| c004 | Users in at least 70 countries reported problems. | Reported | [BBC News (live page)](https://www.bbc.com/news/live/cq5y10ge3dp3t) | BBC News reports Microsoft's email, Teams and Copilot were inaccessible in at least 70 countries. |
| c005 | According to Microsoft's preliminary report, three things together caused the outage: a latent defect in a July update made for Microsoft 365 networking gateway servers, extra load after Teams failed over to the same gateway about 15 hours earlier, and nearly 14% of gateway capacity already out of service for an unrelated reason. | Confirmed | [Microsoft Preliminary Post Incident Report EX1550543/MO1550821 (third-party copy hosted by opensecurity.es)](https://www.opensecurity.es/wp-content/uploads/2026/11/PostIncidentReport.pdf) | The report's Root Cause section lists these three factors. |
| c006 | Microsoft's preliminary report says more than 80% of the gateway servers were unresponsive at the lowest point, and that safeguards between regions did not stop the failure from spreading worldwide. | Confirmed | [Microsoft Preliminary Post Incident Report EX1550543/MO1550821 (third-party copy hosted by opensecurity.es)](https://www.opensecurity.es/wp-content/uploads/2026/11/PostIncidentReport.pdf) | The report states both points in its Root Cause section. |
| c007 | Microsoft said the outage was "a technical issue not related to cyber or AI / agents", introduced during an earlier network capacity upgrade and surfaced by a recent network change. | Confirmed | [Microsoft (official X account)](https://x.com/i/status/2121282013600907325) | Microsoft's official X account posted this statement on Nov 13. |
| c008 | During the outage, Microsoft's status updates said there was no indication or evidence of malicious or cyber activity. | Confirmed | [Microsoft 365 Status (official X account)](https://x.com/i/status/2121266712884416537) | Microsoft's official status account said there was no indication the outage was the result of malicious or cyber activity. |
| c009 | Microsoft engineers looked into possible attack routes, consulted DDoS specialists, and ruled out an attack using crash reports and logs. | Reported | [The Verge](https://www.theverge.com/tech/1035364/microsoft-outlook-outage-notepad) | The Verge reports this from sources familiar with the response. |
| c010 | The Microsoft 365 outage was caused by a cyberattack, hack or DDoS. | Debunked | [The White House](https://www.whitehouse.gov/releases/2026/11/no-indication-of-a-cyberattack-dni-clayton-and-secretary-rubio-on-recent-tech-outages/) | The White House quotes the Director of National Intelligence saying the recent outages are not a cyberattack, and the Secretary of State saying there is zero evidence any of them involve hackers or hostile actors and that the Microsoft incident is unrelated to the FAA's. |
| c011 | The outage was caused by AI-written code or AI agents. | Rumor | [The Verge](https://www.theverge.com/tech/1035364/microsoft-outlook-outage-notepad) | The Verge reports people outside Microsoft wondering whether the outage came from a cyberattack or careless AI coding. |
| c012 | The Microsoft outage was part of a coordinated attack linked to the FAA, bank and other outages that week. | Debunked | [The White House](https://www.whitehouse.gov/releases/2026/11/no-indication-of-a-cyberattack-dni-clayton-and-secretary-rubio-on-recent-tech-outages/) | The White House says officials see no indication of a coordinated cyberattack, state-sponsored activity or malign actor, and the Secretary of State says the Microsoft incident has nothing to do with the FAA's. |
| c013 | Criminals sent phishing emails posing as Microsoft 365 outage notices that cited the real incident ID EX1550543 and falsely warned that held mail would be deleted. Microsoft says stolen credentials and malware have not been confirmed. | Confirmed | [Microsoft Threat Intelligence (official X account)](https://x.com/i/status/2121491564161581148) | Microsoft Threat Intelligence describes the campaign, its subject lines and sender domains. |
| c014 | Microsoft extended its email timeout to 48 hours so that mail delayed during the outage would not be returned as undeliverable. | Confirmed | [Microsoft 365 Status (official X account)](https://x.com/i/status/2121172248241348867) | Microsoft's official status account posted the 48-hour extension. |
| c015 | Microsoft released a preliminary post-incident report on Nov 15 to 16, available only inside the Microsoft 365 admin center. | Confirmed | [Microsoft 365 Status (official X account)](https://x.com/i/status/2122205066157257160) | Microsoft's official status account said the preliminary report was available in the admin center under MO1550821 and EX1550543. |
| c016 | Microsoft says its final post-incident report is due Nov 20, 2026. | Confirmed | [Microsoft Preliminary Post Incident Report EX1550543/MO1550821 (third-party copy hosted by opensecurity.es)](https://www.opensecurity.es/wp-content/uploads/2026/11/PostIncidentReport.pdf) | The preliminary report's repair-items table lists the full list of repair items as due 11/20/2026 with the final report. |
| c017 | On Nov 18, Microsoft's Azure status page showed no active events, and Azure's status history listed no incident review newer than Sep 30, 2026. | Confirmed | [Azure status page](https://azure.status.microsoft/en-us/status) | The Azure status page read "There are currently no active events" when we checked. |
| c018 | A major Microsoft Azure outage happened on Nov 18, 2026. | Not established | [Azure status page](https://azure.status.microsoft/en-us/status) | Microsoft's Azure status page showed no active events, and we found no outlet reporting a major Azure outage that day. |

## Timeline

Times are Eastern (UTC-5). Microsoft's report gives UTC times; we converted them. Inferred times are marked.

| Time (ET) | What happened | Claim | Label |
|---|---|---|---|
| 8:07 PM Wed Nov 11 | Teams traffic automatically fails over onto the gateway servers shared with Exchange Online (01:07 UTC Nov 12), per Microsoft's preliminary report | `c005` | Confirmed |
| 10:40 AM Thu | Microsoft posts that it is investigating Teams problems in North America | `c002` | Confirmed |
| 11:20 AM | Incident start: high-priority alert for Exchange Online (16:20 UTC), per Microsoft's preliminary report | `c001` | Confirmed |
| 12:54 PM | Microsoft posts that it is investigating Exchange Online mailbox access problems in the Americas | `c002` | Confirmed |
| 2:00 PM | Microsoft pauses all ongoing and planned deployments and configuration changes (19:00 UTC), per its preliminary report | `c005` | Confirmed |
| 2:20 AM Fri | Microsoft identifies a fix that reverts the defective change and starts applying it (07:20 UTC), per its preliminary report | `c005` | Confirmed |
| 4:24 AM | Microsoft extends the email timeout to 48 hours to preserve delayed mail | `c014` | Confirmed |
| 10:39 AM | Microsoft says there is no indication of malicious or cyber activity | `c008` | Confirmed |
| 11:10 AM | Incident end: customers no longer seeing active impact (16:10 UTC), per Microsoft's preliminary report | `c001` | Confirmed |
| 11:40 AM | Microsoft apologizes and says it was a technical issue not related to cyber or AI / agents | `c007` | Confirmed |
| 1:09 AM Sat | Microsoft says service is restored to the remaining customers and regions | `c001` | Confirmed |
| 1:32 AM Sat | Microsoft Threat Intelligence warns of phishing emails exploiting the outage | `c013` | Confirmed |
| 12:48 AM Mon | Microsoft says its preliminary post-incident report is available in the admin center | `c015` | Confirmed |
| Wed Nov 18 (time not given) | White House publishes officials' statements that the recent outages were not a cyberattack and are unrelated | `c012` | Debunked |
| 8:59 PM Wed | Azure status page shows no active events when checked | `c017` | Confirmed |

## Official statements

> We are deeply sorry for the disruption this incident has caused our customers and partners. [...] This was a technical issue not related to cyber or AI / agents. The incident was introduced by an issue during an earlier network capacity upgrade that surfaced following a recent network change.
>
> — Microsoft, on its official X account, Nov 13

> First, a latent defect caused Windows servers to become overwhelmed and unresponsive under certain load conditions. [...] This defect was the result of a fix that was prepared specifically for Microsoft 365 networking gateway servers; neither the underlying defect nor the fix applies to broader Windows deployments.
>
> — Microsoft Preliminary Post Incident Report, Nov 15 (third-party copy)

> This is not a cyberattack, and this is not a coordinated effort by a nation state.
>
> — Director of National Intelligence, quoted by the White House, Nov 18

## Checked, not found

- Microsoft's own copy of the preliminary post-incident report. Not checked: it needs a Microsoft 365 admin-center login. We cite a third-party copy, labeled as such.
- Microsoft's final post-incident report. Not yet published; due Nov 20, 2026.
- Any credible claim of a hack, breach or attacker behind the outage. Not found.
- A major Azure outage on Nov 18, 2026. Not found.
- AP's article on the recovery. Not checked: access blocked.

## Update log

Times are Eastern, newest first.

| Time (ET) | Update |
|---|---|
| 9:25 PM Wed | Not checked: AP's article (access blocked). Not checked: Microsoft's own copy of its preliminary post-incident report (it needs a Microsoft 365 admin-center login). We cite a third-party copy instead and label it as one. |
| 9:20 PM Wed | Page drafted from public sources, including Microsoft's official X posts; every source link re-checked tonight. The AI or agents claim is labeled Rumor, not Debunked, because only Microsoft has addressed it. We found no major Azure outage on Nov 18. The final verdict is not applied; it awaits the CEO's decision. |

## Sources

- [Investigating Teams issues in North America (TM1550488)](https://x.com/i/status/2120904489209143320) (Microsoft 365 Status on X)
- [Investigating Exchange Online mailbox access in the Americas (EX1550543)](https://x.com/i/status/2120938282204688468) (Microsoft 365 Status on X)
- [Recovery progress; no indication of malicious or cyber activity](https://x.com/i/status/2121266712884416537) (Microsoft 365 Status on X)
- [Apology; "a technical issue not related to cyber or AI / agents"](https://x.com/i/status/2121282013600907325) (Microsoft on X)
- [Email timeout extended to 48 hours to preserve delayed mail](https://x.com/i/status/2121172248241348867) (Microsoft 365 Status on X)
- [Service restored to remaining customers and regions](https://x.com/i/status/2121485746334777593) (Microsoft 365 Status on X)
- [Preliminary post-incident report released in the admin center](https://x.com/i/status/2122205066157257160) (Microsoft 365 Status on X)
- [Phishing campaign exploiting the Microsoft 365 outage](https://x.com/i/status/2121491564161581148) (Microsoft Threat Intelligence on X)
- [Microsoft Preliminary Post Incident Report for Microsoft 365, Nov 15, 2026](https://www.opensecurity.es/wp-content/uploads/2026/11/PostIncidentReport.pdf) (third-party copy; Microsoft's own copy needs an admin-center login)
- [Microsoft's incident reports for PennO365](https://mailservices.isc.upenn.edu/computing/email/penno365/alerts/ms-incidents.html) (University of Pennsylvania mirror of Microsoft's service health notices)
- [Microsoft says months-old bug caused global Microsoft 365 outage](https://www.bleepingcomputer.com/news/microsoft/microsoft-says-months-old-bug-caused-global-microsoft-365-outage/) (BleepingComputer)
- [Microsoft blames email outage on software defect introduced in July fix](https://www.theregister.com/saas/2026/11/16/microsoft-blames-monster-email-outage-on-software-defect-introduced-in-july-fix/5310026) (The Register)
- [Microsoft rules out cyberattack in outage, warns of phishing campaign](https://www.securityweek.com/microsoft-rules-out-cyberattack-in-outage-warns-of-phishing-campaign/) (SecurityWeek)
- [Inside Microsoft's giant Outlook outage](https://www.theverge.com/tech/1035364/microsoft-outlook-outage-notepad) (The Verge)
- [Microsoft identifies issues leading to global Outlook outage](https://abcnews.com/US/outlook-outage-cause-microsoft-reason-teams-down/story?id=138174626) (ABC News)
- [Microsoft says it is 'deeply sorry' for global outage after almost 24 hours of disruption](https://www.bbc.com/news/live/cq5y10ge3dp3t) (BBC News)
- [Microsoft services recover after global outage](https://apnews.com/article/microsoft-outage-outlook-email-365-recover-ca395c0f1e51af784b6d70afb6554f6a) (AP) — link blocked our check (blocked)
- ["No indication of a cyberattack": DNI and Secretary of State on recent tech outages](https://www.whitehouse.gov/releases/2026/11/no-indication-of-a-cyberattack-dni-clayton-and-secretary-rubio-on-recent-tech-outages/) (The White House)
- [Rubio says US not 'under systemic attack' after series of tech outages](https://www.bbc.com/news/articles/crkgvxxwpwz2o) (BBC News)
- [A wave of tech outages raised fears of sabotage. The explanation may be much simpler.](https://www.nbcnews.com/tech/security/microsoft-faa-chase-nsa-week-major-outages-tech-plan-conspiracy-down-rcna609876) (NBC News)
- [Azure status (read 8:59 PM ET, Nov 18, 2026)](https://azure.status.microsoft/en-us/status) (Microsoft Azure)
- [Azure status history (post incident reviews)](https://azure.status.microsoft/en-us/status/history/) (Microsoft Azure)

## Data files

- `data/incidents/2026-11-microsoft-365-outage/claims.csv`
- `data/incidents/2026-11-microsoft-365-outage/sources.csv`
- `data/incidents/2026-11-microsoft-365-outage/timeline.csv`
- `data/incidents/2026-11-microsoft-365-outage/update_log.csv`
