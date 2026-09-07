import type {
  LocationClaimProvider,
  LocationObservationProvider,
} from './browser-location';
import type { MapFactory } from './components/exploration/map-provider';

export const locationClaimProvider: LocationClaimProvider | undefined =
  undefined;
export const locationObservationProvider:
  LocationObservationProvider | undefined = undefined;
export const mapFactory: MapFactory | undefined = undefined;
