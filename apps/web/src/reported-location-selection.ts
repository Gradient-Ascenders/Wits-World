import type { LocationClaim } from './browser-location';

const REPORTED_LOCATION_WINDOW_MS = 10_000;
const AGE_PENALTY_METRES_PER_SECOND = 1.5;

export interface ReportedLocationSelection {
  samples: readonly LocationClaim[];
  selected: LocationClaim;
}

/**
 * Keeps the displayed claim responsive without allowing one degraded callback
 * to immediately replace a recent, substantially more accurate reading.
 * Every returned coordinate is an unchanged browser-provided claim.
 */
export function selectReportedLocation(
  previousSamples: readonly LocationClaim[],
  incoming: LocationClaim,
): ReportedLocationSelection {
  const incomingTime = Date.parse(incoming.acquiredAt);
  const newestTime = Math.max(
    incomingTime,
    ...previousSamples.map((sample) => Date.parse(sample.acquiredAt)),
  );
  const samples = [...previousSamples, incoming].filter((sample) => {
    const acquiredAt = Date.parse(sample.acquiredAt);
    return (
      Number.isFinite(acquiredAt) &&
      acquiredAt >= newestTime - REPORTED_LOCATION_WINDOW_MS &&
      acquiredAt <= newestTime
    );
  });

  const selected = samples.reduce((preferred, candidate) => {
    const preferredScore = scoreClaim(preferred, newestTime);
    const candidateScore = scoreClaim(candidate, newestTime);

    if (candidateScore < preferredScore) {
      return candidate;
    }

    if (
      candidateScore === preferredScore &&
      Date.parse(candidate.acquiredAt) > Date.parse(preferred.acquiredAt)
    ) {
      return candidate;
    }

    return preferred;
  });

  return { samples, selected };
}

function scoreClaim(claim: LocationClaim, newestTime: number): number {
  const ageSeconds =
    Math.max(0, newestTime - Date.parse(claim.acquiredAt)) / 1_000;
  return claim.accuracyMetres + ageSeconds * AGE_PENALTY_METRES_PER_SECOND;
}
