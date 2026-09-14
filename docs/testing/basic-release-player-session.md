---
title: Basic release player validation script
---

# Basic release player validation script

Use this script before and during each of the at least five real, anonymised
sessions required by issue #167. Wits Quest is being evaluated, not the
participant. Explain voluntary participation, note-taking and any recording,
allow the participant to skip or stop, and obtain consent outside this public
repository. Do not coach until the participant is blocked; record any help.

## Session metadata

| Field                         | Value                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Anonymous ID                  | `P__`                                                                        |
| Session date and time zone    | **Pending manual evidence**                                                  |
| Release/deployment or commit  | **Pending manual evidence**                                                  |
| Facilitator                   | Store only the role or approved public identifier                            |
| Context                       | Campus / remote / controlled lab / other broad context                       |
| Device category               | Mobile / tablet / desktop; no unique device identifier                       |
| OS and browser family/version | **Pending manual evidence**                                                  |
| Input                         | Touch / keyboard / pointer / voice / other                                   |
| Assistive technology used     | None reported / screen reader and name / other / prefer not to say           |
| Network context               | Broad description only                                                       |
| Limitations or interruptions  | **Pending manual evidence**                                                  |
| Consent boundary              | Notes / sanitised screenshots / recording; retain consent outside repository |

Do not record names, student numbers, emails, passwords, tokens, face photos,
precise coordinates, device identifiers, or unnecessary demographic data.

## Facilitator flow

1. Confirm the safe test environment, release identifier, account/data reset
   plan, and that no participant can affect another person's account.
2. Read the consent summary and ask the participant to work naturally and think
   aloud only if comfortable.
3. Start from the same agreed entry point. Record first actions, hesitation,
   backtracking, requests for help, error/recovery states, and assistance given.
4. Ask neutral prompts such as “What do you expect to happen?” Avoid revealing
   labels, routes, rules, or answers unless the task is already blocked.
5. Run only safe failure cases. Never disable security, expose secrets, delete a
   real account without explicit session scope, or ask someone to move through
   an unsafe/restricted place.
6. Ask the closing questions, sanitise the notes, create candidate findings,
   and retain original observations separately from interpretation.

## Core tasks and observation record

Use exactly one outcome: `Completed`, `Completed with difficulty`, `Failed`, or
`Not attempted`. A task is not a pass merely because the facilitator completed
it. Use a stable finding ID only after a genuine observation is classified.

| Task | Participant goal                                                  | Outcome                     | Observable problem/confusion and assistance | Severity | Accessibility concern | Notes/evidence | Finding ID |
| ---: | ----------------------------------------------------------------- | --------------------------- | ------------------------------------------- | -------- | --------------------- | -------------- | ---------- |
|   01 | Register or create a safe test account                            | **Pending manual evidence** |                                             |          |                       |                |            |
|   02 | Sign in and recognise the signed-in state                         | **Pending manual evidence** |                                             |          |                       |                |            |
|   03 | Explore the campus/event experience using map or list             | **Pending manual evidence** |                                             |          |                       |                |            |
|   04 | Explain an event's availability and reachability                  | **Pending manual evidence** |                                             |          |                       |                |            |
|   05 | Submit a reported location when safe and appropriate              | **Pending manual evidence** |                                             |          |                       |                |            |
|   06 | Open an available challenge and understand its start summary      | **Pending manual evidence** |                                             |          |                       |                |            |
|   07 | Answer the challenge content without facilitator answers          | **Pending manual evidence** |                                             |          |                       |                |            |
|   08 | Explain correct/incorrect, score, timer, and completion feedback  | **Pending manual evidence** |                                             |          |                       |                |            |
|   09 | Identify and explain the card reward or no-reward state           | **Pending manual evidence** |                                             |          |                       |                |            |
|   10 | Find and inspect the collection                                   | **Pending manual evidence** |                                             |          |                       |                |            |
|   11 | Create or select a valid five-card deck and understand validation | **Pending manual evidence** |                                             |          |                       |                |            |
|   12 | Start and complete a CPU battle, including turn/action feedback   | **Pending manual evidence** |                                             |          |                       |                |            |
|   13 | Find the completed match and interpret history/result             | **Pending manual evidence** |                                             |          |                       |                |            |
|   14 | Use profile/account/logout behaviour that is safe in this session | **Pending manual evidence** |                                             |          |                       |                |            |

## Safe failure-state probes

Run only states feasible and safe in the session. Record `Not attempted` with a
reason when a state cannot be induced legitimately.

| Probe                                                      | Expected recoverable experience                                                                     | Outcome and observed state  | Evidence/finding |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| Location permission denied                                 | Explanation, usable event list, and retry action; no eligibility request from a missing browser fix | **Pending manual evidence** |                  |
| Inaccurate, stale, or timed-out location                   | Neutral retry/timeout guidance; no guessed presence decision                                        | **Pending manual evidence** |                  |
| Map unavailable                                            | Accessible text list remains usable                                                                 | **Pending manual evidence** |                  |
| Event unavailable, already completed, upcoming, or expired | Text status and an appropriate next action                                                          | **Pending manual evidence** |                  |
| Challenge or API failure                                   | Safe error, no leaked answer/state, and practical retry                                             | **Pending manual evidence** |                  |
| Poor connectivity                                          | Clear pending/offline/recovery state where feasible without unsafe network manipulation             | **Pending manual evidence** |                  |
| Invalid deck or action                                     | Specific rule/rejection reason; server remains authoritative                                        | **Pending manual evidence** |                  |
| Sign-in/session failure                                    | Safe recovery path without exposing authentication details                                          | **Pending manual evidence** |                  |

## Closing questions

1. What did you think Wits Quest wanted you to do?
2. Which part felt easiest, and why?
3. Where did you feel uncertain, stuck, or surprised?
4. Did any status, rule, reward, deck requirement, or battle term feel unclear?
5. Was anything difficult to see, reach, read, hear, or operate?
6. What is the single most important change you would make?
7. Would you use this on campus, and what would affect that decision?

Quote only words captured accurately with consent. Otherwise paraphrase and
label the text as a facilitator summary.

## Session summary

| Field                                          | Result                      |
| ---------------------------------------------- | --------------------------- |
| Tasks completed independently                  | **Pending manual evidence** |
| Tasks completed with difficulty                | **Pending manual evidence** |
| Tasks failed                                   | **Pending manual evidence** |
| Tasks not attempted and why                    | **Pending manual evidence** |
| Candidate finding IDs                          | **Pending manual evidence** |
| Limitations affecting interpretation           | **Pending manual evidence** |
| Representative sanitised screenshot references | **Pending manual evidence** |

Transfer genuine findings to the [finding register](basic-release-findings.md)
without overwriting the original session observation.

## AI declaration

This pre-session script and empty record were generated and edited with the
assistance of Codex[GPT-5]. It contains no fabricated participant, quotation,
device, session, observation, or outcome.
