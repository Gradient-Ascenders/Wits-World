export function rankedSearchRange(waitMilliseconds: number): number {
  return Math.min(
    400,
    100 + 50 * Math.floor(Math.max(0, waitMilliseconds) / 15_000),
  );
}
