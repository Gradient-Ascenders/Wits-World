---
title: 'Risks and mitigations'
description: Product, delivery, and personal-data risks, including the safeguards and POPIA checks still needed.
---

# Risks and mitigations

The main risks concern reliable campus access, protected game state, user data,
external services, and the evidence needed to assess a release. This summary describes
controls in the repository and the verification each area still requires.
Detailed ratings and assignments belong to the team's working records.

## Campus access and accessibility

Device location can be inaccurate, stale, denied, or unavailable. The API
checks reported location and event availability; the interface provides retry
and failure states. A text event list supports discovery alongside the map.
Device readings remain claims, so automated distance checks cannot establish
physical presence or prove that campus thresholds suit every device.

The [location journey](../requirements/player-location-journey.md) explains the
current behaviour. The [field evidence](scrum/sprint-1/evidence.md#on-campus-field-evidence)
records the missing campus observations. Responsive and component tests also
need to be supplemented by real-device, keyboard, and screen-reader review.

## Game integrity and privacy

Retries and concurrent requests can duplicate rewards or conflict with card,
trade, and match state. The API owns protected decisions; transactions,
constraints, version checks, and idempotent outcomes preserve integrity.
Database tests exercise these failure boundaries directly.

Location and moderation evidence also create privacy risks. The initial
Basic-only assumption that player location is never stored no longer describes
the later movement and offline systems. Their storage and compliance risks are
set out below.

## User data storage and POPIA

**Priority: High. Status: Open - compliance not verified.**

The 9 October 2026 repository review found privacy safeguards, but did not
establish project-wide compliance with the Protection of Personal Information
Act (POPIA). Provider settings, agreements, and organisational procedures need
operator review; this is a risk assessment, not a legal compliance certification.

The risk is that personal data is exposed, retained unnecessarily, or processed
without adequate notice or a lawful basis. Precise location and moderation
records can reveal a player's movements or behaviour even when identified by a
game UUID rather than a real name.

### Where user data is stored

| Store               | Personal data and exposure                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth0               | Sign-in identity and provider-managed account data; the game database links accounts through issuer and subject identifiers.                                                                                                                                                         |
| Neon PostgreSQL     | Player Names, optional profile text/study details/avatars, gameplay history, precise movement evidence, and trust/review records. See [accounts](../database/player-schema.md), [movement](../database/movement-evidence.md), and [trust storage](../database/trust-persistence.md). |
| Browser storage     | Offline sessions, answers, and start/finish location claims in IndexedDB. Cleanup can fail on a shared device; [offline play](../architecture/offline-challenge-play.md) describes the boundary.                                                                                     |
| External services   | Upstash receives player-linked limit/coordination identifiers; Mapbox receives map-area requests. Hosting and identity providers may retain operational logs. See [external data sharing](../architecture/external-integrations.md).                                                 |
| Backups and exports | Database recovery copies, provider logs, moderation exports, and user-testing records need separate access and retention controls. An application purge does not remove all such copies.                                                                                             |

### Existing safeguards

The implementation includes API access checks, private-by-default profiles,
request-log redaction, a **24-hour default** movement-evidence expiry with cleanup,
and coordinated Auth0/database deletion with retries. Trust records have their
own retention rules; retained deleted-player cases use profile-free actor
references and redact free text. The
[deletion contract](../database/account-deletion-retention.md) defines that scope.

Expiry still depends on configured retention and functioning cleanup. Verify
hosted deletion and recovery, browser cleanup failures, and whether retained
history can identify someone through other records. A replacement identifier
alone should not be treated as proof of anonymisation.

### Actions needed before claiming compliance

- **Accountability:** Confirm the responsible party, registered Information Officer, and privacy contact (sections 8 and 55).
- **Purpose and notice:** Record lawful grounds and necessary data; publish a collection notice. Browser location permission is not the full notice (sections 10-13 and 18).
- **Retention:** Justify each retention period, including unresolved cases, backups, logs, and exports; verify expiry and deletion (section 14).
- **Providers:** Verify hosting/support regions, written operator agreements, and a valid overseas-transfer ground. Foreign hosting is not automatically prohibited (sections 21 and 72).
- **Rights and incidents:** Test access, correction, objection, and deletion procedures; establish security-compromise notification to the Regulator and affected users (sections 11, 22-24).
- **Children and sensitive content:** Assess applicable conditions if children can register or profiles/review evidence contain special personal information (sections 26-35).

These checks follow the
[official POPIA text](https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf).
[Section 72](https://popia.co.za/section-72-transfers-of-personal-information-outside-republic/)
on the supplied reference site explains transfer conditions; the
[Information Regulator's incident guidance](https://inforegulator.org.za/2025/08/19/fact-sheet-handling-of-security-compromises/)
supports the notification procedure.

Keep this risk open until the operator's privacy review records the accountable
owner, notices, provider/retention decisions, and tested rights and incident
procedures. Technical team roles do not determine the legal responsible party.

## External services and operations

Auth0, Mapbox, Neon, and Upstash introduce configuration, quota, availability,
and cost dependencies. Integration tests and failure handling reduce exposure;
provider settings and hosted recovery need operator verification. The
[integration reference](../architecture/external-integrations.md) describes the
service boundaries and configuration.

Background workers and realtime listeners share limited database capacity.
Coordination and listener isolation address different sources of contention;
their deployed benefit depends on configuration and measured behaviour.
[Gameplay operations](../deployment/ranked-operations.md) and
[battle responsiveness](scrum/sprint-2/evidence.md#battle-responsiveness) retain the
rollout requirements and measurement limits.

## Delivery and release evidence

Parallel work can cause contract drift, merge conflicts, and outdated guides.
Focused branches, independent review, runtime schemas, tests, and documentation
updates keep the layers aligned. The final period prioritises completing and
checking existing journeys as described in the [roadmap](delivery-roadmap.md).

Passing automation can still leave usability, provider, or deployment failures
unobserved. Participant retests, named-build acceptance, and stakeholder review
must be recorded separately. The
[testing strategy](../testing/testing-strategy.md) and
[Sprint 3 validation record](scrum/sprint-3/evidence.md) identify
the evidence boundaries. [AI review and disclosure](ai-use.md) address the
additional risk of incorrect or unattributed generated work.

## Reviewing risk

Planning and release reviews consider impact, likelihood, dependencies, and
new feedback. Actionable risks need an owner, a linked issue, a mitigation,
and evidence of its outcome. Implementing a control reduces exposure; a risk
is closed only when the relevant evidence supports that decision.

The [August baseline and reviews](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/0a70f5bec1a4d179bb5d4996f29deb9966c1b4ac/docs/planning/risk-register.md)
remain historical evidence. Their initial ratings and owners should not be
read as current tracker state. Sprint review and retrospective sections record
later concerns and follow-up recommendations.

**AI declaration:** The original register and reviews used
ChatGPT-Web[GPT-5.6 Thinking], Codex-CLI[GPT-5], Codex[GPT-5],
Codex-CLI[gpt-5.6-sol medium], and Codex-CLI[GPT-6]. This revision used
Codex[GPT-6] for rubric comparison, source and data-flow review, POPIA source
comparison, and prose editing.
