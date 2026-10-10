---
title: 'Trails and artwork'
---

# Trails and artwork

**Meeting:** 8 September 2026 with Calvin Rea; format was not recorded.
**Team:** Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder and Caleb Perumalsamy.

[All stakeholder reviews](index.md)

This retrospective record was prepared on 14 September from a team summary.
The linked implementations predate the meeting: they were reviewed against the
feedback, not delivered because of it. No formal acceptance was recorded.

## Feedback and decisions

- **Include ordered campus trails:** Accepted. Events should form sequential
  journeys, with completion and next-step guidance derived by the server.
- **Use SVG for every card:** Not selected for the 30 detailed illustrations.
  The team retained PNG originals and optimised WebP delivery; native SVG remains
  suitable for reusable frame decoration, not embedded raster wrappers.

## Implementation evidence

- [#176](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/176) /
  [PR #197](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/197):
  ordered membership, publication/retirement, Author operations, authoritative
  progress and bounded nearby guidance.
- [#177](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/177) /
  [PR #223](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/223):
  responsive trail discovery, progress, next-step navigation, map-independent
  access and focused browser coverage.
- [#164](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/164) /
  [PR #230](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/230):
  30 PNG originals, 30 WebP exports, alt text, fallbacks, attribution and a
  validated artwork manifest.

These references establish implementation, not stakeholder acceptance.

## Follow-up

Demonstrate deployed trails and the collection to Calvin. Record requested
adjustments and explicit acceptance, with an issue/PR link for each change.

## AI declaration

Prepared and edited with assistance from Codex[gpt-5.6-sol], Codex-CLI[GPT-6]
and Codex[GPT-6], using team-provided meeting details and repository evidence.
