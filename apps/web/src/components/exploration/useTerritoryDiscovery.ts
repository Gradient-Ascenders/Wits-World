import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getTerritoryHistory,
  getTerritoryStandings,
  getTerritoryZone,
  listTerritoryZones,
  TerritoryApiError,
  type TerritoryHistory,
  type TerritoryStandings,
  type TerritoryZoneDetail,
  type TerritoryZoneSummary,
} from '../../api/territory';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';

const VISIBILITY_REFRESH_AGE_MS = 60_000;
const SETTLEMENT_REFRESH_DELAY_MS = 2_000;

export interface TerritoryListState {
  lastUpdatedAt: number | null;
  message: string | null;
  refreshing: boolean;
  stale: boolean;
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  zones: TerritoryZoneSummary[];
}

export type TerritoryDetailSection = 'detail' | 'history' | 'standings';

export interface TerritoryDetailState {
  detail: TerritoryZoneDetail | null;
  failedSections: TerritoryDetailSection[];
  history: TerritoryHistory | null;
  lastUpdatedAt: number | null;
  refreshing: boolean;
  stale: boolean;
  standings: TerritoryStandings | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  zoneId: string | null;
}

const initialListState: TerritoryListState = {
  lastUpdatedAt: null,
  message: null,
  refreshing: false,
  stale: false,
  status: 'idle',
  zones: [],
};

const initialDetailState: TerritoryDetailState = {
  detail: null,
  failedSections: [],
  history: null,
  lastUpdatedAt: null,
  refreshing: false,
  stale: false,
  standings: null,
  status: 'idle',
  zoneId: null,
};

interface UseTerritoryDiscoveryOptions {
  apiBaseUrl: string;
  enabled: boolean;
  getAccessToken: ApiAccessTokenProvider;
  onSelectedZoneUnavailable: () => void;
  selectedZoneId: string | null;
}

export function useTerritoryDiscovery({
  apiBaseUrl,
  enabled,
  getAccessToken,
  onSelectedZoneUnavailable,
  selectedZoneId,
}: UseTerritoryDiscoveryOptions) {
  const [list, setList] = useState<TerritoryListState>(initialListState);
  const [detail, setDetail] =
    useState<TerritoryDetailState>(initialDetailState);
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const selectedZoneRef = useRef(selectedZoneId);
  const listRef = useRef(list);

  selectedZoneRef.current = selectedZoneId;
  listRef.current = list;

  const loadDetail = useCallback(
    async (zoneId: string, refresh = false): Promise<void> => {
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      setDetail((current) =>
        current.zoneId === zoneId && current.status === 'ready'
          ? { ...current, refreshing: true }
          : {
              ...initialDetailState,
              status: 'loading',
              zoneId,
              refreshing: refresh,
            },
      );

      const options = {
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
        zoneId,
      };
      const [zoneResult, standingsResult, historyResult] =
        await Promise.allSettled([
          getTerritoryZone(options),
          getTerritoryStandings(options),
          getTerritoryHistory(options),
        ]);
      if (controller.signal.aborted || selectedZoneRef.current !== zoneId) {
        return;
      }

      if (
        zoneResult.status === 'rejected' &&
        zoneResult.reason instanceof TerritoryApiError &&
        zoneResult.reason.failure === 'not-found'
      ) {
        onSelectedZoneUnavailable();
        setDetail(initialDetailState);
        return;
      }

      const failedSections: TerritoryDetailSection[] = [];
      if (zoneResult.status === 'rejected') failedSections.push('detail');
      if (standingsResult.status === 'rejected') {
        failedSections.push('standings');
      }
      if (historyResult.status === 'rejected') failedSections.push('history');
      const allFailed = failedSections.length === 3;

      setDetail((current) => {
        if (current.zoneId !== zoneId) return current;
        if (allFailed && current.status === 'ready') {
          return {
            ...current,
            failedSections,
            refreshing: false,
            stale: true,
          };
        }
        return {
          detail: zoneResult.status === 'fulfilled' ? zoneResult.value : null,
          failedSections,
          history:
            historyResult.status === 'fulfilled' ? historyResult.value : null,
          lastUpdatedAt: allFailed ? null : Date.now(),
          refreshing: false,
          stale: allFailed,
          standings:
            standingsResult.status === 'fulfilled'
              ? standingsResult.value
              : null,
          status: allFailed ? 'error' : 'ready',
          zoneId,
        };
      });
    },
    [apiBaseUrl, getAccessToken, onSelectedZoneUnavailable],
  );

  const loadZones = useCallback(
    async (refresh = false): Promise<void> => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      setList((current) =>
        current.status === 'ready' || current.status === 'empty'
          ? { ...current, refreshing: true, message: null }
          : { ...initialListState, status: 'loading', refreshing: refresh },
      );

      try {
        const zones = await listTerritoryZones({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setList({
          lastUpdatedAt: Date.now(),
          message: null,
          refreshing: false,
          stale: false,
          status: zones.length === 0 ? 'empty' : 'ready',
          zones,
        });

        const selected = selectedZoneRef.current;
        if (selected && !zones.some((zone) => zone.zoneId === selected)) {
          onSelectedZoneUnavailable();
          setDetail(initialDetailState);
          return;
        }
        if (selected) void loadDetail(selected, true);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof TerritoryApiError &&
          error.failure === 'authorization'
            ? 'Your session could not load territories. Sign in again, then retry.'
            : 'Territories could not be refreshed. Check your connection and retry.';
        setList((current) =>
          current.zones.length > 0
            ? {
                ...current,
                message,
                refreshing: false,
                stale: true,
              }
            : {
                ...initialListState,
                message,
                status: 'error',
              },
        );
      }
    },
    [apiBaseUrl, getAccessToken, loadDetail, onSelectedZoneUnavailable],
  );

  useEffect(() => {
    if (!enabled) return;
    const current = listRef.current;
    const crossedSettlementBoundary = current.zones.some(
      (zone) =>
        zone.windowEnd !== null && Date.parse(zone.windowEnd) <= Date.now(),
    );
    if (
      current.status === 'idle' ||
      crossedSettlementBoundary ||
      (current.lastUpdatedAt !== null &&
        Date.now() - current.lastUpdatedAt >= VISIBILITY_REFRESH_AGE_MS)
    ) {
      void loadZones(current.status !== 'idle');
    }
  }, [enabled, loadZones]);

  useEffect(() => {
    if (!enabled || !selectedZoneId) {
      detailRequest.current?.abort();
      if (!selectedZoneId) setDetail(initialDetailState);
      return;
    }
    void loadDetail(selectedZoneId);
  }, [enabled, loadDetail, selectedZoneId]);

  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      const updatedAt = listRef.current.lastUpdatedAt;
      if (
        document.visibilityState === 'visible' &&
        updatedAt !== null &&
        Date.now() - updatedAt >= VISIBILITY_REFRESH_AGE_MS
      ) {
        void loadZones(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, loadZones]);

  useEffect(() => {
    if (!enabled || list.status !== 'ready') return;
    const nextBoundary = list.zones
      .map((zone) => (zone.windowEnd ? Date.parse(zone.windowEnd) : NaN))
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right)[0];
    if (nextBoundary === undefined) return;
    const timeout = window.setTimeout(
      () => void loadZones(true),
      Math.min(
        2_147_000_000,
        Math.max(0, nextBoundary - Date.now() + SETTLEMENT_REFRESH_DELAY_MS),
      ),
    );
    return () => window.clearTimeout(timeout);
  }, [enabled, list.status, list.zones, loadZones]);

  useEffect(
    () => () => {
      listRequest.current?.abort();
      detailRequest.current?.abort();
    },
    [],
  );

  return {
    detail,
    list,
    refreshDetail: () => {
      if (selectedZoneRef.current) {
        void loadDetail(selectedZoneRef.current, true);
      }
    },
    refreshZones: () => void loadZones(true),
  };
}
