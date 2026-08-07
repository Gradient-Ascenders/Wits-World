import { describe, expect, it } from 'vitest';

import { buildApiConfig } from '../src/config/api.js';

const validEnvironment: NodeJS.ProcessEnv = {
  HOST: '127.0.0.1',
  PORT: '3000',
  LOG_LEVEL: 'info',
};

describe('API configuration', () => {
  it('builds a valid API configuration', () => {
    expect(buildApiConfig({ env: validEnvironment })).toEqual({
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
    });
  });

  it.each(['HOST', 'PORT', 'LOG_LEVEL'] as const)(
    'rejects a missing %s value',
    (variableName) => {
      const env = {
        ...validEnvironment,
      };

      delete env[variableName];

      expect(() => buildApiConfig({ env })).toThrow(
        `${variableName} is required to start the API.`,
      );
    },
  );

  it.each(['0', '65536', '3.5', 'not-a-port'])(
    'rejects the invalid port %s',
    (port) => {
      expect(() =>
        buildApiConfig({
          env: {
            ...validEnvironment,
            PORT: port,
          },
        }),
      ).toThrow('PORT must be an integer between 1 and 65535.');
    },
  );

  it('rejects an unsupported log level', () => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          LOG_LEVEL: 'verbose',
        },
      }),
    ).toThrow(
      'LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent.',
    );
  });
});
