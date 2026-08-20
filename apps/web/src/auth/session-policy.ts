export interface AuthSessionPolicy {
  cacheLocation: 'localstorage' | 'memory';
  useRefreshTokens: boolean;
  useRefreshTokensFallback: boolean;
}

const LOCAL_STORAGE_MODES = new Set(['development', 'e2e', 'sprint1-e2e']);

export function getAuthSessionPolicy(mode: string): AuthSessionPolicy {
  if (LOCAL_STORAGE_MODES.has(mode)) {
    return {
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
      useRefreshTokensFallback: false,
    };
  }

  return {
    cacheLocation: 'memory',
    useRefreshTokens: true,
    useRefreshTokensFallback: true,
  };
}
