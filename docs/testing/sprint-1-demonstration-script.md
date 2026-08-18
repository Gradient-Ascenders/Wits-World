# Sprint 1 demonstration script

## Before the demonstration

Use the deployed release SHA and a safe Auth0 test player. Open the Web, API,
documentation, and reviewed evidence links in advance. Do not display tokens,
environment files, database URLs, private coordinates, or developer-tool query
values. Keep challenge and later gameplay out of this Sprint 1 demonstration.

## Script

1. **Deployment:** show the public Web home page and state the release SHA.
   Expected: the Wits World application loads over HTTPS.
2. **Authentication:** sign in through Auth0 and open `/explore`. Expected: the
   protected player route becomes available. Do not expose session data.
3. **Published event:** show the Great Hall event in the text list and on the
   map. Expected: both presentations identify the same active event. Briefly
   show sanitised network host/path/status evidence that the deployed Web called
   the deployed API.
4. **Authority boundary:** explain that the browser supplies a one-shot location
   claim only after the action; the API and PostGIS own event data, distance,
   radius, and the final result. Browser geolocation is not proof of presence.
5. **Reachable:** from reviewed safe in-range evidence, show the reachable text.
   Expected: it explicitly refers to the reported location.
6. **Unreachable:** show reviewed safe out-of-range evidence. Expected: visibly
   different text says the event is not reachable.
7. **Permission denied:** deny site location permission. Expected: a usable
   explanation and retry guidance appear while the event list remains usable.
8. **Poor accuracy:** show a reviewed real-device retry or the automated retry
   evidence. Expected: the application requests a clearer fresh reading and
   does not guess or accuse.
9. **Map fallback:** block Mapbox locally in the browser or show reviewed
   failure evidence. Expected: a map explanation appears but event text and the
   reachability action remain available.
10. **Supporting evidence:** show the two consecutive deterministic E2E results,
    focused Explore/API tests, database release and recovery documents, and the
    deployed security review. Do not present a local test as production proof.
11. **Documentation:** open the public Sprint 1 release validation and evidence
    pages. Expected: the release procedure can be followed by another reviewer.

## Contingency for live geolocation

Do not move through unsafe or restricted areas to force an outcome. If indoor
conditions or the demonstration venue cannot safely produce both location
states, use sanitised, teammate-reviewed field evidence from #43/#44 and run
`npm run test:e2e:sprint1` to demonstrate the deterministic React/Fastify/
PostGIS path. Clearly label which evidence is deployed/manual and which is
automated/local.

## Completion note

End by showing the #20 acceptance matrix and naming every remaining manual or
post-merge gate. A successful demonstration does not by itself prove current
main CI, deployment, production database release, or absence of severe Gitea
issues.

## AI declaration

This document was planned and reviewed with assistance from
ChatGPT-Web[GPT-5.6 Sol] and generated and edited with assistance from
Codex[GPT-5].
