# Player Location and Eligibility Journey

:::note[Historical Sprint 1 journey]

This page preserves the Sprint 1 one-shot reachability journey. Current Explore
location behaviour and its presentation-only map boundary are documented in the
[Mapbox Standard 3D integration boundary](../architecture/mapbox-standard-migration.md).

:::

## Sprint 1 outcome

An authenticated player can use the map-independent event list on `/explore` to
check whether an active event is reachable. The browser requests one location
reading after the player selects **Check reachability**, sends the resulting
claim to the protected API, and displays the API's decision in text.

This journey does not open a challenge, issue a reward, track movement, or prove
that the player is physically present.

## Player journey

1. The authenticated player opens `/explore` and reviews published events on the
   campus map or in the nearby-events list.
2. An active event presents **Check reachability**. Upcoming and ended events do
   not request location.
3. The player selects the action before the browser requests geolocation
   permission.
4. If permission is granted, the browser requests a fresh, high-accuracy reading
   with a ten-second timeout and no cached position.
5. The web application submits the event identifier, latitude, longitude,
   reported accuracy, and acquisition time to the protected eligibility API.
6. The API validates the claim and event, uses the authoritative PostGIS event
   location and radius, and returns a reachable, unreachable, retry, or
   unavailable result.
7. The interface announces the result in text and offers **Check again**. A retry
   starts a new one-shot location request; it does not reuse the earlier claim or
   start continuous tracking.

## Player-facing states

| State                    | Player experience                                                            |
| ------------------------ | ---------------------------------------------------------------------------- |
| Permission not requested | The event remains browsable and exposes a clear Check reachability action.   |
| Requesting location      | A polite status message explains that the browser is obtaining a reading.    |
| Checking reachability    | A polite status message explains that the API check is in progress.          |
| Reachable                | Text states that the event is reachable from the reported location.          |
| Unreachable              | Text states that the event is not reachable from the reported location.      |
| Permission denied        | The player is directed to browser settings and can continue browsing events. |
| Timeout                  | The player is encouraged to move to an open area and try again.              |
| Location unavailable     | The player is directed to check device location services and retry.          |
| Inaccurate or ambiguous  | The interface does not guess; it requests a clearer reading.                 |
| Stale or future reading  | The interface requests a fresh reading without accusing the player.          |
| Event unavailable        | The interface explains that availability may have changed since discovery.   |
| API or session failure   | A safe explanation and retry action appear without internal details.         |

All outcomes use text in addition to colour. Errors are announced as alerts;
loading and eligibility results use status announcements.

## Privacy and authority

Browser geolocation is an untrusted location claim, not proof of presence. A
browser reading may be inaccurate, stale, unavailable, modified, or associated
with a device that is not where the player claims it is. The interface therefore
uses “reported location” and never describes the result as verified.

The web application does not calculate distance, compare the event radius, or
decide eligibility. It does not add an `eligible` field to the request. The API
and PostgreSQL/PostGIS remain authoritative for event availability, stored event
coordinates, distance, radius, and the final result.

The web application keeps the location values only long enough to construct the
single API request. It does not write them to React state, browser storage, logs,
the map provider, or a movement history. Server-side retention remains governed
by the project's documented data-retention boundary; this journey introduces no
location-history feature.

## Browser and device limitations

- Production geolocation normally requires HTTPS; `localhost` is treated as a
  secure context by supported browsers.
- Permission prompts, settings, and retry behaviour differ between browsers,
  operating systems, managed devices, and embedded web views.
- Indoor positioning, weak satellite visibility, Wi-Fi conditions, battery
  settings, and device hardware can produce slow or ambiguous readings.
- A high-accuracy request is a preference to the browser, not a guarantee of GPS
  accuracy.
- Denied permission may require the player to change site permissions before the
  browser will show another prompt.
- Automated tests mock browser and API boundaries. They do not validate Auth0
  tenant settings, real-device accuracy, or field conditions on campus.

## Field-test evidence and current limitation

The controlled real-device procedure, sanitised results record, and threshold
decision status for Sprint 1 are maintained in
[the location eligibility field-test protocol](location-eligibility-field-test.md).

As of 12 August 2026, no real-device campus observations are recorded in this
repository. The seeded `75 m` radius, two-minute claim freshness value, and
accuracy handling therefore remain provisional. Automated tests verify the
browser/API contract but cannot calibrate these values for real campus
conditions.

The preceding document was planned, generated, and edited with the assistance
of: Codex-CLI[GPT-5].
