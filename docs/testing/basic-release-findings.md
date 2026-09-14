---
title: Basic release finding and disposition register
---

# Basic release finding and disposition register

This register starts empty. Add a row only for a genuine observation from a
participant (`P__`), accessibility/device run (`A11Y-__`), field run (`GEO-__`),
stakeholder review (`SH-__`), automated run (`AUTO-__`), or deployed smoke
(`DEPLOY-__`). Preserve the original observation even after a fix.

Use the existing project severity terms:

- **Critical:** blocks a core journey for affected users, risks
  security/privacy/data integrity, or creates a severe accessibility barrier
  without a practical workaround.
- **High:** causes failure or requires facilitator help on an important journey
  with only a difficult workaround.
- **Medium:** causes repeated confusion, delay, or error but can be completed
  independently.
- **Low:** minor clarity, consistency, or polish impact.

Disposition must be exactly `Accepted`, `Postponed`, `Rejected with reason`, or
`Unresolved`. `Accepted` means accepted for action, not already fixed. A
Critical or High accepted finding cannot be cleared without a real fix reference
and retest result. Create or link a Gitea issue only through an authorised action
and only when it genuinely exists.

## Finding register

No findings are recorded yet. An empty register is not evidence that no defects
exist.

| Finding ID | Source/session | Description and observable evidence | Affected journey | Severity | Reproducibility | Accessibility/security/data impact | Disposition and reason | Gitea issue | Fix reference | Retest release/run and result |
| ---------- | -------------- | ----------------------------------- | ---------------- | -------- | --------------- | ---------------------------------- | ---------------------- | ----------- | ------------- | ----------------------------- |

## Retest protocol

1. Identify the original finding, exact affected task, environment, expected
   behaviour, and release containing the fix.
2. Repeat the smallest reliable automated regression and the relevant original
   human/device/field task. Do not replace a required human retest with a unit
   test.
3. Record `Resolved`, `Improved but open`, `Not resolved`, `Regressed`, or `Not
run`, plus limitations and evidence.
4. Keep the original severity and observation; add the post-fix assessment
   rather than rewriting history.
5. Review all Critical/High findings before any statement that no severe defect
   blocks the Basic journey.

## Release disposition summary

| Measure                                   | Result                                |
| ----------------------------------------- | ------------------------------------- |
| Total genuine findings                    | **Pending manual/automated evidence** |
| Critical open / accepted but not retested | **Pending evidence**                  |
| High open / accepted but not retested     | **Pending evidence**                  |
| Medium and Low unresolved                 | **Pending evidence**                  |
| Findings linked to genuine Gitea issues   | **Pending evidence**                  |
| Release-blocking conclusion and reviewer  | **Pending manual evidence**           |

## AI declaration

This empty register and retest protocol were generated and edited with the
assistance of Codex[GPT-5]. The placeholder row is not a finding, and no issue,
fix, retest, or disposition was fabricated.
