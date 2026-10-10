---
title: Sprint 4 evidence
description: Dated delivery, verification, and remaining acceptance evidence.
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint 4 evidence

**Snapshot:** 8 October 2026, `origin/main` at `a9dca04`.

This interim record covers 29 September–8 October, not the 11 October final
submission. Read the [Sprint report](report.md) for the reconstructed ceremony
summaries and [photo provenance](report.md#image-provenance).

## Acceptance limits

- No original stakeholder acceptance or release sign-off was supplied.
- Local Lighthouse and structural/query-count checks do not establish deployed
  latency or performance improvement.
- Coordinated idle scheduling remains staged, with polling the default. Listener
  configuration, Neon connection headroom, hosted outage/recovery checks, and
  signed-in journeys require separate deployment evidence.
- Later work, participant retests, and final submission acceptance are outside
  this snapshot.

Historical PR integration and commit-reported checks remain distinct from
current deployment, stakeholder acceptance, and participant retests.

## Merge register

Twenty-seven first-parent PR merges appear in the selected period. Rows record
integration dates in Johannesburg time; branch authoring can precede a merge.
PR references are taken from retained Git merge subjects, without a fresh
remote tracker or CI-status audit. The linked full commit IDs fix this snapshot.

| Integrated        | Pull request                                                              | Change                                                           | Merge commit                                                                                                      |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 29 September 2026 | [PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333) | Improve homepage Lighthouse performance                          | [`2dfa470`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/2dfa470995ec3e67b9a076d2f761fd9086518ef9) |
| 30 September 2026 | [PR #334](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/334) | Avoid duplicate navigation on first service-worker install       | [`f8f463f`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/f8f463f42b4c1b6e58d70e4d6ba0213dc00ff8b5) |
| 30 September 2026 | [PR #335](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/335) | Defer CPU match code from public startup                         | [`b32fed8`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/b32fed8eca74072db2185ede54767bdd503d4808) |
| 30 September 2026 | [PR #336](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/336) | Polish Explore navigation, trails, territories and campus time   | [`04fcfa4`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/04fcfa4d8dac26b781ded1b3cefc22834aa40f4d) |
| 30 September 2026 | [PR #337](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/337) | Right-size collection card artwork                               | [`3f64d42`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/3f64d4250c9ab9250621c791cc80a747f67cebe0) |
| 1 October 2026    | [PR #338](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/338) | Reduce CPU battle presentation delay                             | [`09570fe`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/09570fe60790992477470984a834d7a75725af07) |
| 1 October 2026    | [PR #339](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/339) | Reduce battle deck hydration round trips                         | [`6a76493`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6a76493fffb1ea16833c8051445884d7641cbaa2) |
| 2 October 2026    | [PR #340](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/340) | Reduce PvP action database round trips                           | [`6bc06c1`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6bc06c1f3a04d9eeba47d2ad315bb8ae6a9c15a9) |
| 2 October 2026    | [PR #341](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/341) | Refine collection, decks, evolutions and trading                 | [`e740e0b`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/e740e0bdb356202598ebe420e0bd60d0f6d7ef5c) |
| 3 October 2026    | [PR #342](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/342) | Add player profile showcases and responsive editing              | [`4e3cc79`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/4e3cc79ec894a995ffe1699a71c108832eb1cca0) |
| 3 October 2026    | [PR #343](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/343) | [feat] streamline author workflows and analytics                 | [`d6caaa4`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/d6caaa432df029ac8644ec495fb329008dff8090) |
| 3 October 2026    | [PR #344](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/344) | [feat] refine match lobbies and completed battle reports         | [`4250796`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/4250796d7e1fe82e3ac4936198cf5e3b282c2ba1) |
| 4 October 2026    | [PR #345](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/345) | Reduce PvP acceptance response hydration reads                   | [`f35900e`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/f35900e9d6d875d9f8c9aa681dfb54b839fb19bb) |
| 4 October 2026    | [PR #346](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/346) | Combine PvP acceptance receipt and clock read                    | [`a39adf6`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a39adf666f5f0d46de89b6791decc375e4a22d0d) |
| 4 October 2026    | [PR #347](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/347) | Add PvP match-ready phase observability                          | [`5ff46de`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5ff46de0f6d14428bed08ccaeb303da1e675a2ed) |
| 4 October 2026    | [PR #348](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/348) | [refactor] simplify account settings and accessibility controls  | [`2858331`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/285833175f8639af07ce56dbc67c1dd5b7fc99db) |
| 4 October 2026    | [PR #349](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/349) | [feat] unify typography and accessible reading preferences       | [`19918b2`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/19918b2c733e82a62058111d30b97cff5a8c96d9) |
| 4 October 2026    | [PR #350](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/350) | Reduce PvP match detail database round trips                     | [`61f816f`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/61f816f20417ef4c659bcb0c36e805c87cdedc95) |
| 5 October 2026    | [PR #351](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/351) | Consolidate PvP acceptance initial writes                        | [`fe98059`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/fe98059bce7f810210bc690cbe94b62f426b37ee) |
| 5 October 2026    | [PR #352](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/352) | Wait for PvP terminal result heading focus                       | [`9ae06aa`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/9ae06aa46d6be60f888276be725a5eef72e11353) |
| 6 October 2026    | [PR #353](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/353) | Add PostgreSQL pool pressure observability                       | [`77ff352`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/77ff35228b57adadb242323b21ce20ab63dad99c) |
| 6 October 2026    | [PR #354](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/354) | Reduce ranked settlement policy database reads                   | [`3ab2588`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/3ab25883afc6a644316945ae10c63dfbd010f740) |
| 7 October 2026    | [PR #355](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/355) | Preserve SPA navigation from the homepage to Explore             | [`0c31724`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/0c31724bdb97fde2addff5bc06f1644275c37a4e) |
| 7 October 2026    | [PR #359](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/359) | Reduce mobile Explore map startup work                           | [`2838235`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/2838235d0cfde954d802e3d562ff2a93baa2fec4) |
| 7 October 2026    | [PR #360](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/360) | Polish app-wide loading and retained refresh states              | [`20c223b`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/20c223b8c56112dea0c07a0b36b18df3b4eaa73d) |
| 8 October 2026    | [PR #361](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/361) | [fix] let idle gameplay workers stop querying Neon safely        | [`b7e1bac`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/b7e1bac735e05feb0cf97f4558e5bf3a44ff1d96) |
| 8 October 2026    | [PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362) | [perf] Isolate PostgreSQL notification listener from shared pool | [`a9dca04`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a9dca04b509eb06a91c3370e7245779d501eb69f) |

## AI declaration

The reconstructed merge register was prepared with assistance from Codex[GPT-6].
It was moved here with assistance from Codex[GPT-6], without changing its PRs,
commit IDs, dates, or acceptance boundaries.
