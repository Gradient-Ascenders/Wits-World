import { validatePlayerName } from '@wits-world/account-policy';

import type {
  AuthenticatedPrincipal,
  DatabasePlayerPrincipal,
  GooglePlayerPrincipal,
  InteractivePlayerPrincipal,
  MachinePrincipal,
  SupportedConnectionStrategy,
} from './types.js';

type InteractiveClaims =
  | Pick<DatabasePlayerPrincipal, 'connectionStrategy' | 'playerName'>
  | Pick<GooglePlayerPrincipal, 'connectionStrategy' | 'playerName'>
  | Pick<MachinePrincipal, 'connectionStrategy' | 'playerName'>;

export const CONNECTION_STRATEGY_CLAIM =
  'https://witsworld.co.za/connection_strategy' as const;
export const PLAYER_NAME_CLAIM = 'https://witsworld.co.za/player_name' as const;

export const AUTH0_DATABASE_CONNECTION_STRATEGY = 'auth0' as const;
export const GOOGLE_CONNECTION_STRATEGY = 'google-oauth2' as const;

export const SUPPORTED_CONNECTION_STRATEGIES = [
  AUTH0_DATABASE_CONNECTION_STRATEGY,
  GOOGLE_CONNECTION_STRATEGY,
] as const satisfies readonly SupportedConnectionStrategy[];

export function readInteractivePlayerClaims(
  payload: Record<string, unknown>,
): InteractiveClaims {
  const strategyClaim = payload[CONNECTION_STRATEGY_CLAIM];

  if (strategyClaim === undefined) {
    return { connectionStrategy: null, playerName: null };
  }

  if (!isSupportedConnectionStrategy(strategyClaim)) {
    throw new Error(
      'Validated access token has an unsupported connection-strategy claim.',
    );
  }

  if (strategyClaim === GOOGLE_CONNECTION_STRATEGY) {
    return { connectionStrategy: strategyClaim, playerName: null };
  }

  const playerNameClaim = payload[PLAYER_NAME_CLAIM];

  if (typeof playerNameClaim !== 'string') {
    throw new Error(
      'Validated database-account token is missing a valid player-name claim.',
    );
  }

  const validation = validatePlayerName(playerNameClaim);

  if (!validation.valid || validation.playerName !== playerNameClaim) {
    throw new Error(
      'Validated database-account token is missing a valid player-name claim.',
    );
  }

  return {
    connectionStrategy: strategyClaim,
    playerName: playerNameClaim,
  };
}

export function isInteractivePlayerPrincipal(
  principal: AuthenticatedPrincipal,
): principal is InteractivePlayerPrincipal {
  return principal.connectionStrategy !== null;
}

function isSupportedConnectionStrategy(
  value: unknown,
): value is SupportedConnectionStrategy {
  return (
    typeof value === 'string' &&
    SUPPORTED_CONNECTION_STRATEGIES.some((strategy) => strategy === value)
  );
}
