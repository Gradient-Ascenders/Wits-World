# Sprint 1 Location Eligibility Field-Test Protocol

:::note[Historical Sprint 1 evidence]

This page preserves the Sprint 1 field-test protocol and its recorded evidence
state. Current eligibility semantics are documented in
[Event Eligibility Calculation](../database/event-eligibility.md); confirmed
product decisions are maintained in the
[Basic-tier decision register](basic-tier-decision-register.md).

:::

## Purpose and scope

This protocol supports issue [#43](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/43),
`S1-W2-01 — Field-test and calibrate Sprint 1 location eligibility`.

Its purpose is to determine whether the deployed Sprint 1 location journey is
usable on campus. It is not a method for proving a player's presence, measuring
movement, or testing unauthorised or unsafe locations.

Use the deployed HTTPS web application, its paired deployed API, an
authenticated development player, and an active seeded Sprint 1 event. Do not
substitute local mocks for the real-device observations required by the issue.

## Current implementation to verify

The test operator should confirm the following implemented behaviour before
recording results:

- the browser requests a single location reading only after the player selects
  **Check reachability**;
- the browser requests a fresh, high-accuracy reading with no cached position
  and a ten-second browser timeout;
- the browser sends a location claim to the protected API but does not calculate
  distance or select the eligibility result;
- the API evaluates the authoritative PostGIS distance and radius, incorporates
  the reported accuracy, and returns `reachable`, `unreachable`, `retry`, or
  `unavailable`;
- a retry is a fresh player action and one new location request, not continuous
  monitoring; and
- denied permission and map failure do not remove the text event list.

## Safety and privacy controls

- Test only from safe, authorised public locations. Do not test while crossing
  roads, driving, or in restricted areas.
- Do not store or publish latitude, longitude, a full access token, raw request
  headers, or a precise movement path.
- Screenshots must exclude browser developer tools, address-bar query values,
  console output, and any screen that displays precise coordinates.
- Record broad conditions such as `inside event area`, `clearly outside event
area`, or `difficult positioning`; do not record a coordinate or an exact
  route.
- Use the player-facing term “reported location”. A result is not verified
  presence.

## Test matrix

Complete at least the first four runs on one real mobile device. Repeat a
representative reachable or safe-retry run on a materially different browser or
device when available.

| Run | Condition and action                                                                                        | Expected player-facing result                                                      | Expected API result                                                                                                                                   | Evidence to retain                            |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| F1  | Open `/explore` before selecting **Check reachability**.                                                    | Active event remains visible; no location prompt yet.                              | No eligibility request.                                                                                                                               | One redacted screen, device/browser record.   |
| F2  | From a safe position well within the active event area, select **Check reachability** and grant permission. | Reachable result, or a safe retry if the reported accuracy is insufficient.        | `reachable`, or `retry` with `location_accuracy`.                                                                                                     | Redacted outcome screen and status/reason.    |
| F3  | From a safe position clearly outside the event area, select **Check reachability** and grant permission.    | Unreachable result.                                                                | `unreachable` with `reachable: false`.                                                                                                                | Redacted outcome screen and status.           |
| F4  | Reset the site location permission, select **Check reachability**, then deny it.                            | Permission explanation; event list and retry action remain usable.                 | No eligibility request after the denied browser request.                                                                                              | Redacted outcome screen and permission state. |
| F5  | In a realistically difficult but safe positioning condition, select **Check reachability** once.            | Clear reading result, timeout guidance, or an accuracy retry; no guessed decision. | If a claim reaches the API near the accuracy boundary, `retry` with `location_accuracy`; otherwise no API eligibility result after a browser failure. | Redacted outcome screen and broad condition.  |
| F6  | Select **Check again** after a retry or browser failure.                                                    | A new one-shot request and a new status announcement.                              | A new eligibility request only if the browser supplies a claim.                                                                                       | Outcome screen and action count.              |

The `stale_location` and `future_acquisition_time` outcomes are API contract
checks. They cannot be reliably induced through normal browser geolocation and
are covered by automated API tests unless a real deployed observation occurs.

## Results record

Add one row per attempted run. Leave fields as `not observed` rather than
inferring a result. Do not include coordinates, tokens, or raw API bodies.

| Run | Date         | Device and OS | Browser and version | Route/event               | Permission state | Broad condition            | UI outcome   | API `status` / `reason` | UI/API consistent? | Evidence link | Notes                     |
| --- | ------------ | ------------- | ------------------- | ------------------------- | ---------------- | -------------------------- | ------------ | ----------------------- | ------------------ | ------------- | ------------------------- |
| F1  | not recorded | not recorded  | not recorded        | `/explore` / active event | not recorded     | pre-action                 | not observed | no request expected     | not recorded       | not recorded  | awaiting real-device test |
| F2  | not recorded | not recorded  | not recorded        | `/explore` / active event | not recorded     | inside event area          | not observed | not observed            | not recorded       | not recorded  | awaiting real-device test |
| F3  | not recorded | not recorded  | not recorded        | `/explore` / active event | not recorded     | clearly outside event area | not observed | not observed            | not recorded       | not recorded  | awaiting real-device test |
| F4  | not recorded | not recorded  | not recorded        | `/explore` / active event | denied           | permission reset           | not observed | no request expected     | not recorded       | not recorded  | awaiting real-device test |
| F5  | not recorded | not recorded  | not recorded        | `/explore` / active event | not recorded     | difficult positioning      | not observed | not observed            | not recorded       | not recorded  | awaiting real-device test |
| F6  | not recorded | not recorded  | not recorded        | `/explore` / active event | not recorded     | retry                      | not observed | not observed            | not recorded       | not recorded  | awaiting real-device test |

Store screenshots locally in `.pr-screenshots/issue-43/` and attach only the
sanitised files to the issue or resulting pull request. The folder is not
committed.

## Threshold decision record

| Decision          | Current implementation                                                                                                           | Status          | Evidence required before changing                                                                                                                             | Review required                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Event radius      | `75 m` for the seeded Sprint 1 Great Hall event                                                                                  | **Provisional** | F2 and F3 observations across at least one real mobile device, including their reported outcomes; a confirmed issue if the radius causes a misleading result  | Uzair reviews the geospatial interpretation; Data and Infrastructure Lead coordinates any data change |
| Claim freshness   | Maximum claim age of `120,000 ms` (two minutes)                                                                                  | **Provisional** | Real-device timing observations when a usable case can be observed, plus the existing stale-claim API test; record any user-visible delay or unexpected retry | API and Security Lead reviews any route or validation change                                          |
| Accuracy handling | API compares the reported-accuracy envelope with the authoritative distance and radius; it has no separate fixed accuracy cutoff | **Provisional** | F2/F5 observations showing whether the retry guidance is understandable and whether ambiguity is frequent under safe field conditions                         | Uzair reviews the threshold implications; API and Security Lead reviews any server-rule change        |

No threshold is confirmed by this document. A future decision must state the
observed evidence, remaining uncertainty, reviewer, and whether the value is
confirmed, revised but provisional, or unresolved. Do not change a server rule
or event seed from a browser observation alone.

## Reporting a defect or decision request

Create a separate issue when observed behaviour differs from the matrix. Include
the run identifier, device/browser, permission state, broad condition, expected
and observed UI/API outcomes, and sanitised evidence. Exclude precise
coordinates and credentials.

Request Uzair's review before interpreting field observations as a radius or
accuracy-rule change. Request the API and Security Lead's review before changing
claim freshness or API validation. The browser must continue to present the API
result without calculating or overriding eligibility.

## Completion gate

Issue #43 remains incomplete until real-device evidence covers at least two
materially different outcomes, the resulting threshold statuses are updated,
any defects are recorded, and Uzair has reviewed the geospatial interpretation.

---

The preceding document was planned, generated, and edited with the assistance
of: Codex-CLI[GPT-5].
