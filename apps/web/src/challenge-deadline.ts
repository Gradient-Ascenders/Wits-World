export function remainingChallengeSeconds(
  deadline: string,
  now = Date.now(),
): number {
  const deadlineMilliseconds = Date.parse(deadline);

  if (!Number.isFinite(deadlineMilliseconds)) {
    return 0;
  }

  return Math.max(0, Math.ceil((deadlineMilliseconds - now) / 1_000));
}

export function formatChallengeTime(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function describeChallengeTime(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (minutes === 0) {
    return `${seconds} seconds remaining`;
  }

  return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} seconds remaining`;
}
