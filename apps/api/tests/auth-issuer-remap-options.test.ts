import { describe, expect, it } from 'vitest';

import { parseAuthIssuerRemapOptions } from '../src/database/auth-issuer-remap-options.js';

const requiredArguments = [
  '--target',
  'production',
  '--confirm-database',
  'wits_world',
  '--confirm-hostname',
  'ep-production-pooler.example.neon.tech',
  '--from-issuer',
  'https://tenant.example.test/',
  '--to-issuer',
  'https://login.wits-world.example/',
];

describe('Auth0 issuer remap options', () => {
  it('defaults to a read-only dry run', () => {
    expect(parseAuthIssuerRemapOptions(requiredArguments)).toEqual({
      apply: false,
      confirmDatabase: 'wits_world',
      confirmHostname: 'ep-production-pooler.example.neon.tech',
      fromIssuer: 'https://tenant.example.test/',
      target: 'production',
      toIssuer: 'https://login.wits-world.example/',
    });
  });

  it('requires an explicit apply flag before writes', () => {
    expect(
      parseAuthIssuerRemapOptions([...requiredArguments, '--apply']),
    ).toMatchObject({ apply: true });
  });

  it.each([
    [[], '--target is required'],
    [requiredArguments.slice(0, 2), '--confirm-database is required'],
    [
      requiredArguments.filter(
        (argument) =>
          argument !== '--confirm-hostname' &&
          argument !== 'ep-production-pooler.example.neon.tech',
      ),
      '--confirm-hostname is required',
    ],
    [
      requiredArguments.filter(
        (argument) =>
          argument !== '--from-issuer' &&
          argument !== 'https://tenant.example.test/',
      ),
      '--from-issuer is required',
    ],
    [
      [...requiredArguments.slice(0, -1), 'http://login.example.test/'],
      '--to-issuer must be a canonical HTTPS issuer URL',
    ],
    [
      [...requiredArguments.slice(0, -1), 'https://login.example.test'],
      '--to-issuer must be a canonical HTTPS issuer URL ending in one slash',
    ],
    [
      [...requiredArguments, '--unknown'],
      'Unknown Auth0 issuer remap argument',
    ],
  ])('rejects unsafe arguments %j', (arguments_, message) => {
    expect(() => parseAuthIssuerRemapOptions(arguments_)).toThrow(message);
  });

  it('rejects a no-op issuer remap', () => {
    expect(() =>
      parseAuthIssuerRemapOptions([
        ...requiredArguments.slice(0, -1),
        'https://tenant.example.test/',
      ]),
    ).toThrow('The old and new Auth0 issuers must be different.');
  });

  it.each([
    'https://ep-production.example.neon.tech',
    'ep-production.example.neon.tech/path',
    'user@ep-production.example.neon.tech',
  ])('rejects a malformed confirmed hostname: %s', (hostname) => {
    const hostnameIndex = requiredArguments.indexOf(
      'ep-production-pooler.example.neon.tech',
    );
    const arguments_ = [...requiredArguments];
    arguments_[hostnameIndex] = hostname;

    expect(() => parseAuthIssuerRemapOptions(arguments_)).toThrow(
      '--confirm-hostname must contain only a database hostname.',
    );
  });
});
