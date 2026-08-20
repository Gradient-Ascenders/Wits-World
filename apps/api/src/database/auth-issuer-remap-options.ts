import type { DatabaseTarget } from '../config/database.js';

export interface AuthIssuerRemapCliOptions {
  apply: boolean;
  confirmDatabase: string;
  confirmHostname: string;
  fromIssuer: string;
  target: Extract<DatabaseTarget, 'production' | 'test'>;
  toIssuer: string;
}

export function parseAuthIssuerRemapOptions(
  arguments_: readonly string[],
): AuthIssuerRemapCliOptions {
  let apply = false;
  let confirmDatabase: string | undefined;
  let confirmHostname: string | undefined;
  let fromIssuer: string | undefined;
  let target: AuthIssuerRemapCliOptions['target'] | undefined;
  let toIssuer: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--apply') {
      if (apply) {
        throw new Error('--apply may only be provided once.');
      }

      apply = true;
      continue;
    }

    if (
      argument === '--target' ||
      argument === '--confirm-database' ||
      argument === '--confirm-hostname' ||
      argument === '--from-issuer' ||
      argument === '--to-issuer'
    ) {
      const value = arguments_[index + 1]?.trim();

      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }

      if (argument === '--target') {
        if (target !== undefined) {
          throw new Error('--target may only be provided once.');
        }

        if (value !== 'production' && value !== 'test') {
          throw new Error('--target must be either production or test.');
        }

        target = value;
      } else if (argument === '--confirm-database') {
        if (confirmDatabase !== undefined) {
          throw new Error('--confirm-database may only be provided once.');
        }

        confirmDatabase = value;
      } else if (argument === '--confirm-hostname') {
        if (confirmHostname !== undefined) {
          throw new Error('--confirm-hostname may only be provided once.');
        }

        confirmHostname = validateHostname(value);
      } else if (argument === '--from-issuer') {
        if (fromIssuer !== undefined) {
          throw new Error('--from-issuer may only be provided once.');
        }

        fromIssuer = validateCanonicalIssuer(value, '--from-issuer');
      } else {
        if (toIssuer !== undefined) {
          throw new Error('--to-issuer may only be provided once.');
        }

        toIssuer = validateCanonicalIssuer(value, '--to-issuer');
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown Auth0 issuer remap argument: ${argument ?? ''}`);
  }

  if (target === undefined) {
    throw new Error('--target is required and must be production or test.');
  }

  if (confirmDatabase === undefined) {
    throw new Error('--confirm-database is required before database access.');
  }

  if (confirmHostname === undefined) {
    throw new Error('--confirm-hostname is required before database access.');
  }

  if (fromIssuer === undefined) {
    throw new Error('--from-issuer is required.');
  }

  if (toIssuer === undefined) {
    throw new Error('--to-issuer is required.');
  }

  if (fromIssuer === toIssuer) {
    throw new Error('The old and new Auth0 issuers must be different.');
  }

  return {
    apply,
    confirmDatabase,
    confirmHostname,
    fromIssuer,
    target,
    toIssuer,
  };
}

function validateHostname(value: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(`https://${value}/`);
  } catch {
    throw new Error(
      '--confirm-hostname must contain only a database hostname.',
    );
  }

  if (
    parsedUrl.hostname !== value.toLowerCase() ||
    parsedUrl.port !== '' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new Error(
      '--confirm-hostname must contain only a database hostname.',
    );
  }

  return parsedUrl.hostname;
}

function validateCanonicalIssuer(value: string, option: string): string {
  let issuer: URL;

  try {
    issuer = new URL(value);
  } catch {
    throw new Error(`${option} must be a canonical HTTPS issuer URL.`);
  }

  if (
    issuer.protocol !== 'https:' ||
    issuer.username !== '' ||
    issuer.password !== '' ||
    issuer.port !== '' ||
    issuer.pathname !== '/' ||
    issuer.search !== '' ||
    issuer.hash !== '' ||
    issuer.toString() !== value
  ) {
    throw new Error(
      `${option} must be a canonical HTTPS issuer URL ending in one slash.`,
    );
  }

  return value;
}
