# Sprint 1 known limitations

:::note[Historical Sprint 1 release evidence]

These limitations are preserved for the Sprint 1 location/exploration release
and should not be read as the current project limitation list. Start with the
[Basic release overview](../basic-release-reference.md) for current delivered
scope.

:::

These limitations apply only to the Sprint 1 location/exploration release
validated by #20. They are not a list of later-sprint feature gaps.

| Limitation                                                       | Classification and release treatment                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser geolocation is an untrusted claim                        | A device reading can be inaccurate, stale, manipulated, or unrelated to physical presence. The UI says “reported location”; the API validates the claim and PostGIS remains authoritative, but this is not tamper-proof presence proof.                                                                                                                                                                                                                 |
| Location thresholds remain provisional                           | Gitea [#43](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/43) is closed, but the repository field-test record still contains no recorded real-device campus results. Before #20 closes, link and review the actual external #43 evidence, confirm the seeded 75 m radius, two-minute freshness value, and accuracy-envelope interpretation, then update the repository record if appropriate or record the discrepancy as follow-up work. |
| Poor accuracy can legitimately return retry                      | Near a boundary, the accuracy envelope may prevent a safe reachable/unreachable result. The player must receive a fresh retry action; repeated retries under field conditions should be recorded as a defect or calibration input, not overridden in the browser.                                                                                                                                                                                       |
| Live map presentation depends on Mapbox                          | Provider, token, style, tile, WebGL, or network failure can remove the visual map. Event information and reachability actions remain available in the text list and must be checked manually on the deployed build.                                                                                                                                                                                                                                     |
| Auth0, Mapbox, Neon, Azure, and Cloudflare are external services | Their availability and configuration are outside the application process. Local deterministic tests control Auth0/Mapbox while keeping Fastify/PostGIS real; public and authenticated deployment checks are still required per release.                                                                                                                                                                                                                 |
| Deterministic E2E is not in Gitea Actions                        | The runner does not yet have an established dedicated disposable `TEST_DATABASE_URL` and reliable Chromium-capable image. The suite must be run twice locally; it must not be enabled until both safety/reliability prerequisites exist.                                                                                                                                                                                                                |
| Location retention remains unresolved                            | The current Web sends a one-shot claim and does not build location history. The final retention policy remains an open privacy decision, so evidence must not assume permanent exact-coordinate storage is required or approved.                                                                                                                                                                                                                        |
| Authenticated deployment privacy evidence is operator-run        | Public authentication and CORS checks plus automated storage/logging regressions are recorded in the [deployed boundary review](./deployed-auth-cors-privacy-review.md). A real signed-in production browser and Azure log inspection still require a trusted operator; evidence must never include tokens or precise coordinates.                                                                                                                      |
| Automated accessibility is incomplete evidence                   | Semantic tests cover text, alerts/status, action names, and map independence. Keyboard, focus, touch, responsive layout, reduced motion, and screen-reader quality still require reviewed manual evidence.                                                                                                                                                                                                                                              |
| Production database release is operator-controlled               | Gitea deployment does not migrate or seed production. The approved release procedure and recovery rehearsal must be executed/reviewed with sanitised evidence; local integration results are not production proof.                                                                                                                                                                                                                                      |
| Current issue state is not encoded in Git                        | Passing tests cannot prove that no severe defect is open. A current Gitea P0/P1/severe-defect check is a mandatory release gate.                                                                                                                                                                                                                                                                                                                        |

No severe application defect was established by the repository-side validation
document itself. That statement is not a substitute for the current Gitea gate
or the outstanding manual evidence above.

## AI declaration

This document was planned and reviewed with assistance from
ChatGPT-Web[GPT-5.6 Sol] and generated and edited with assistance from
Codex[GPT-5] and Codex-CLI[GPT-5.6 Sol].
The historical-status notice was added with assistance from
Codex-CLI[GPT-5].
