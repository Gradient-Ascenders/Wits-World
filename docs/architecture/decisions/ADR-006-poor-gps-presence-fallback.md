# ADR-006: Poor-GPS presence fallback

- **Status:** Proposed
- **Date:** 2026-09-11
- **Issue:** #170
- **Owners and reviewers:** Wits World Product Lead and API/Security Lead;
  accessibility review and the Wits permission owner remain to be identified

## Context

Browser geolocation can be too inaccurate near or inside campus buildings to
produce an unambiguous event-eligibility result. The current interface safely
asks for a clearer reading; it does not guess that the player is present. This
protects rewards, but can prevent a student who is physically at an event from
starting its challenge.

The existing trust boundary remains mandatory: the browser or device supplies
claims, while the API validates those claims against server-controlled event
configuration and decides eligibility. A fallback must add useful evidence of
physical presence rather than turn another client assertion into authority.

Repository records contain no confirmed stakeholder or group selection for a
poor-GPS proof. The initial client-meeting record mentions map UX but has no
contemporaneous minutes or item-level approval. The field-test thresholds are
provisional, and the offline design explicitly leaves issue #170 outside its
scope. This ADR therefore records an engineering recommendation, not an
accepted product or deployment decision.

## Options considered

| Option                              | Poor-GPS value and student usability                                                                                                                                                                   | Privacy and accessibility                                                                                                                                                                                                           | Abuse and server validation                                                                                                                                                                                                                                                                                                                           | Deployment, compatibility, offline, cost and support                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location-specific physical QR       | Strongest practical low-cost second factor: the student scans a marker at the event. Camera scanning is familiar, but the code must also have a keyboard-readable short code and accessible placement. | Avoids collecting a photo, device identifier or network identity. Camera permission is optional when a short-code entry path is provided. Printed placement, height, contrast, lighting and a non-visual equivalent require review. | A signed or opaque server-registered event token can be validated with the authenticated player, event, validity window and replay policy. A static photographed code can be shared, so rotation, short validity and monitoring reduce but do not eliminate relay or replay. It proves access to location-bound information, not continuous presence. | Standard browser/PWA camera APIs or manual entry; no special hardware. A prepared token can be captured offline and submitted later under a bounded signed validity policy, but offline capture time remains a device claim. Requires Wits permission to place signs plus inspection, replacement and incident procedures. Low material cost; moderate operational maintenance. |
| Campus-network evidence             | Convenient when association is automatic, and independent of satellite accuracy.                                                                                                                       | Network/IP or SSID-derived signals can expose device or network metadata and may exclude students with no Wi-Fi access or configuration problems.                                                                                   | A normal browser cannot reliably read SSID/BSSID, and public IP or network reachability is coarse, VPN/proxy/shareable and not building-specific. Strong validation would require Wits ICT integration or a captive portal, so a browser claim alone is weak.                                                                                         | Requires Wits ICT permission, network architecture knowledge and ongoing support. Poor portability across browsers/PWAs; offline use is contradictory. Low new hardware cost but high institutional dependency.                                                                                                                                                                 |
| Player photo                        | Visually understandable, but taking and uploading a useful photo is slower and socially awkward.                                                                                                       | Highest privacy burden: images may contain faces, bystanders, accessibility information or restricted spaces. Camera, dexterity, vision, lighting and upload constraints create barriers.                                           | Metadata is removable or forgeable; landmark images can be reused or generated. Human review is costly and inconsistent, while automated recognition adds privacy, model and false-rejection risk. It proves possession of an image more readily than presence.                                                                                       | Browser-compatible but bandwidth-heavy and unsuitable offline without retaining sensitive media. Requires image retention, moderation, deletion and incident policy. High operational cost.                                                                                                                                                                                     |
| BLE beacon                          | Can provide a short-range radio observation indoors and can rotate identifiers.                                                                                                                        | May avoid precise coordinates, but Bluetooth permission and device compatibility vary; students without BLE access need an equivalent path.                                                                                         | A server-issued rotating beacon identifier can be checked, but signals can be relayed, recorded or amplified. Browser access cannot be assumed, especially on iOS PWAs.                                                                                                                                                                               | Requires purchased, installed and powered hardware; Wits placement permission; battery, inventory and replacement operations. Weak cross-browser support and difficult offline assurance. Highest hardware and maintenance burden.                                                                                                                                              |
| Staff or event-issued one-time code | Useful for staffed events and accessible as spoken or written text.                                                                                                                                    | Minimal new personal data and can support multiple input modes. It places workload and discretion on staff and may expose participation to them.                                                                                    | Server-generated short-lived, single-use codes can be strong, but shared group codes are relayable and individual distribution can create queues.                                                                                                                                                                                                     | Excellent browser support and possible bounded offline capture, but requires staff presence, training and recovery procedures. Not viable for unattended always-available campus events.                                                                                                                                                                                        |
| Retry GPS or enlarge the radius     | No new interaction or deployment.                                                                                                                                                                      | Lowest added data collection and generally accessible.                                                                                                                                                                              | Adds no independent evidence. A larger radius weakens the location rule and increases remote-claim acceptance; repeated readings remain the same class of device claim.                                                                                                                                                                               | Already compatible and cheap, but does not solve persistent indoor ambiguity and does not satisfy the alternative-proof objective.                                                                                                                                                                                                                                              |

## Recommendation

If Wits and the project group approve a fallback, use a location-specific
physical QR marker with a keyboard-readable short-code equivalent. Treat the
scanned or entered value only as a claim. The API should bind an approved token
to one event and a bounded validity window, validate it for the authenticated
player, enforce an explicit replay policy, and make the final eligibility
decision. GPS should remain the primary path; the fallback should appear only
after an inaccurate/ambiguous result or as an explicitly accessible equivalent.

This is the simplest feasible university-project option because it works in a
normal browser, needs no specialist radio or campus-network integration, avoids
collecting photographs, and has low hardware cost. It is preferable to a static
permanent QR value: signed or opaque identifiers should be rotatable, and the
operational owner must be able to revoke a photographed, vandalised or missing
marker.

## Stakeholder status and decision boundary

The recommendation is **deferred pending stakeholder/group confirmation**.
Before this ADR can become Accepted, the team must record:

- product approval that QR or short-code evidence is an acceptable fallback;
- Wits permission, location and named owner for physical marker placement;
- accessibility review of placement and the non-camera entry path;
- API/Security approval of validity, replay, rotation, revocation and audit
  rules;
- privacy approval of the minimal retained evidence and deletion period; and
- an operator commitment for inspection, replacement and incident handling.

No QR, network, beacon, photo or other proof mechanism is implemented by issue
#170. The Intermediate poor-GPS requirement remains incomplete.

## Security and threat boundaries

The proposal addresses accidental GPS inaccuracy, not determined collusion or a
compromised device. Threats include photographing and sharing a marker, replay
of a captured token, shoulder-surfing the short code, automated guessing,
tampering, replacement with a malicious code, and relay by an on-site player.
Authentication, TLS, event binding, short validity, rotation/revocation,
rate-limiting and server-side replay controls reduce those risks. They cannot
prove continuous presence or prevent real-time relay.

The browser must never submit `eligible: true`, a trusted scan time, a token
validity decision or a reward decision. The API must load the authoritative
event and token record, check publication and availability, apply the approved
proof policy, and return a neutral retry or unavailable result on ambiguity.
Client clocks, camera metadata, screenshots and QR-decoded content are claims.

Tokens must contain no answer key, reward choice, player identity, precise
coordinates or secret capable of minting other tokens. Logs and analytics must
not record raw reusable tokens. A proof accepted for one event must not be valid
for another.

## Privacy, accessibility and offline implications

The QR approach can avoid new biometric, photograph, Wi-Fi identity and
continuous-location collection. A minimal server record would contain only the
authenticated player, event, proof type, token identifier or non-reversible
fingerprint, decision, server receipt time and bounded retention metadata. The
retention period is not decided here and needs explicit approval consistent
with the existing location-evidence policy.

Camera use cannot be the sole path. Markers need high contrast, adequate size,
weather-resistant positioning, reachable height, lighting review, descriptive
instructions, and a short code that can be entered with keyboard and assistive
technology. A support path is required for a missing/damaged marker and for a
student who cannot use either scanning or visual transcription. The equivalent
path must not silently weaken server validation.

For offline play, an issued proof may be stored with a prepared challenge and
submitted later only if an approved server-signed validity policy permits it.
The device's claimed scan time is not authoritative, and a static code plus
delayed upload has substantial replay risk. Initial implementation should
therefore remain online unless a separate approved design specifies issuance,
expiry, device storage, sync grace, replay handling and cleanup. The existing
offline pack signature authenticates content; it does not establish presence.

## Deployment, cost and operational consequences

The material cost is limited to durable printed markers, but deployment is not
free. Wits must approve placement. The team must inventory markers, assign an
owner, inspect them, replace damaged or vandalised copies, rotate/revoke exposed
tokens, preserve an accessible alternative, and respond to support reports.
Unstaffed locations benefit most; a staffed one-time code may be a narrower
alternative where an event already has trained staff.

Network evidence is rejected as the default because browser-visible signals are
too weak and Wits ICT integration is disproportionate. Photos are rejected due
to privacy, accessibility, spoofing and moderation cost. BLE is rejected for
hardware burden and inconsistent browser/PWA support. GPS-only changes are not
an alternative proof. Staff codes remain a situational option, not a universal
campus fallback.

## Proposed follow-up implementation scope

Only after the approvals above, create a separate implementation issue to:

1. define the proof-token format or opaque lookup, event binding, validity,
   replay, rotation, revocation, rate-limit and audit/retention rules;
2. add migrations and Author/operator tooling for token lifecycle without
   exposing signing secrets to the browser;
3. add an authenticated API endpoint that accepts a QR/short-code claim and
   returns a server-authoritative eligibility decision;
4. add accessible scan and manual-entry UI after poor-GPS outcomes, with safe
   missing/invalid/expired/offline states;
5. add unit, database, API and deterministic browser coverage for cross-event
   use, replay, expiry, revocation, guessing limits and privacy-safe logs;
6. document Wits permission, placement inventory, accessibility review,
   replacement/rotation ownership and incident response; and
7. complete real-device and on-campus field validation without recording raw
   codes, precise coordinates or bystander images.

The follow-up must not claim that a QR scan is tamper-proof presence evidence.

## Related work

- [Trust boundaries](../trust-boundaries.md)
- [Player location and eligibility journey](../../requirements/player-location-journey.md)
- [Location eligibility field-test matrix](../../requirements/location-eligibility-field-test.md)
- [Offline challenge play](../offline-challenge-play.md)
- [Privacy-limited movement evidence](../../database/movement-evidence.md)
- [Initial client meeting](../../planning/stakeholder-interactions/initial-client-meeting.md)
- [Risk register](../../planning/risk-register.md)

## AI-use declaration

This proposed decision record was researched, drafted and reviewed with the
assistance of Codex[GPT-5]. The AI did not participate in a stakeholder meeting
and did not confirm the recommendation on behalf of the project group or Wits.
