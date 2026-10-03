export interface PvpHistoryReturn {
  matchId: string;
  loadedCount: number;
  scrollY: number;
  returnHref: '/matches/history' | '/matches/pvp?section=history';
}

// Keep navigation metadata only; battle records are always fetched again.
export function pvpHistoryNavigationState():
  { pvpHistoryReturn: PvpHistoryReturn } | undefined {
  const value = window.history.state?.pvpHistoryReturn;
  if (
    !value ||
    typeof value.matchId !== 'string' ||
    !Number.isSafeInteger(value.loadedCount) ||
    value.loadedCount < 0 ||
    !Number.isFinite(value.scrollY) ||
    value.scrollY < 0 ||
    !['/matches/history', '/matches/pvp?section=history'].includes(
      value.returnHref,
    )
  )
    return undefined;
  return { pvpHistoryReturn: value };
}
