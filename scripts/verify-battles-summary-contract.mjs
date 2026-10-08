import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const entryPath = '/api/v1/matches/cpu/entry';
const historyPath = '/api/v1/matches/history';

function objectWith(schema, required) {
  return (
    schema?.type === 'object' &&
    schema.additionalProperties === false &&
    required.every(
      (key) => schema.required?.includes(key) && schema.properties?.[key],
    )
  );
}

function nullableObject(schema, required) {
  return (
    schema?.anyOf?.some((item) => item.type === 'null') &&
    schema.anyOf.some((item) => objectWith(item, required))
  );
}

function responseProfiles(document, path) {
  const operation = document?.paths?.[path]?.get;
  if (!operation?.security?.some((item) => Array.isArray(item.bearerAuth))) {
    throw new Error(
      'Summary endpoint does not advertise bearer authentication.',
    );
  }
  return (
    operation.responses?.['200']?.content?.['application/json']?.schema
      ?.oneOf ?? []
  );
}

function verifySchemas(document) {
  const entry = responseProfiles(document, entryPath).find((schema) =>
    objectWith(schema, ['activeMatch', 'selectedDeck', 'requestId']),
  );
  if (
    !entry ||
    entry.properties.requestId.type !== 'string' ||
    !nullableObject(entry.properties.activeMatch, [
      'matchId',
      'status',
      'startedAt',
      'state',
    ]) ||
    !nullableObject(entry.properties.selectedDeck, ['deckId', 'name'])
  ) {
    throw new Error(
      'Deployed API does not advertise the compact entry contract.',
    );
  }

  // Both profiles have these root keys; select the bounded, round-count profile.
  const summaries = responseProfiles(document, historyPath).find(
    (schema) =>
      objectWith(schema, ['matches', 'requestId']) &&
      schema.properties.matches?.maxItems === 20 &&
      objectWith(schema.properties.matches.items, [
        'matchId',
        'status',
        'winner',
        'startedAt',
        'completedAt',
        'roundCount',
      ]),
  );
  if (
    !summaries ||
    summaries.properties.requestId.type !== 'string' ||
    summaries.properties.matches.type !== 'array' ||
    summaries.properties.matches.items.properties.roundCount.type !==
      'integer' ||
    summaries.properties.matches.items.properties.rounds
  ) {
    throw new Error(
      'Deployed API does not advertise the compact history contract.',
    );
  }
}

function releaseOrigin(environment) {
  if (
    !/^[0-9a-f]{40}$/.test(environment.DEPLOY_SHA ?? '') ||
    environment.API_PUBLISHED_SHA !== environment.DEPLOY_SHA
  ) {
    throw new Error(
      'API publication for the selected commit is not confirmed.',
    );
  }
  try {
    const origin = new URL(environment.API_ORIGIN);
    const webBase = new URL(environment.WEB_API_BASE_URL);
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      webBase.origin !== origin.origin ||
      webBase.username ||
      webBase.password ||
      webBase.pathname.replace(/\/+$/, '') !== '/api/v1' ||
      webBase.search ||
      webBase.hash
    ) {
      throw new Error();
    }
    return origin.origin;
  } catch {
    throw new Error('Frontend API base must address the published HTTPS API.');
  }
}

async function readJson(fetchFn, url, expectedStatus, timeoutMs) {
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== expectedStatus) {
      // Do not log response bodies, upstream error text or URLs.
      throw new Error();
    }
    return await response.json();
  } catch {
    throw new Error(
      'Deployed contract request failed or returned an unexpected response.',
    );
  }
}

export async function verifyBattlesRelease(
  environment,
  {
    fetchFn = globalThis.fetch,
    attempts = 3,
    retryDelayMs = 5000,
    timeoutMs = 10000,
  } = {},
) {
  const origin = releaseOrigin(environment);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      verifySchemas(
        await readJson(fetchFn, `${origin}/documentation/json`, 200, timeoutMs),
      );
      for (const path of [
        `${entryPath}?view=summary`,
        `${historyPath}?view=summary&limit=5`,
      ]) {
        // Query validation runs before authentication. The old API returns 400;
        // the new API accepts the profile and rejects the anonymous read with 401.
        const problem = await readJson(
          fetchFn,
          `${origin}${path}`,
          401,
          timeoutMs,
        );
        if (problem?.code !== 'UNAUTHORIZED') {
          throw new Error(
            'Summary endpoint did not enforce the expected auth contract.',
          );
        }
      }
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await delay(retryDelayMs);
    }
  }
  throw new Error('No deployed contract verification attempt completed.');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await verifyBattlesRelease(process.env);
    console.log(
      'API publication, summary schemas, query acceptance and auth boundaries verified.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
