import { openDB, type DBSchema } from 'idb';
import type { LocationClaim } from '../browser-location';
import type { PlayerEvent } from '../api/events';
import { checkOfflineLocation, OFFLINE_LOCATION_MAX_AGE_MS } from './location';

export const OFFLINE_CONTENT_BUDGET_BYTES = 4 * 1024 * 1024;
export const OFFLINE_ARRIVAL_WINDOW_MS = 5 * 60 * 1000;

export interface OfflinePack {
  version: 1;
  packId: string;
  playerId: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  placementAssignmentId?: string;
  locationPolicy?: 'arrival-v1';
  rewardContext?: {
    policyVersion: string;
    cards: Array<{
      cardDefinitionId: string;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
    }>;
  };
  event: {
    eventId: string;
    version: number;
    title: string;
    description: string | null;
    latitude: number;
    longitude: number;
    radiusMetres: number;
  };
  challengeId: string;
  challengeVersion: number;
  format: 'multiple_choice' | 'ordering';
  timeLimitSeconds: 90 | 120 | 150;
  questions: Array<{
    id: string;
    version: number;
    prompt: string;
    difficulty: 1 | 2 | 3;
    options: Array<{ id: string; text: string }>;
  }>;
}
export interface CachedPack {
  pack: OfflinePack;
  packToken: string;
}
export interface LocalAttempt {
  clientAttemptId: string;
  playerId: string;
  cached: CachedPack;
  startedAt: string;
  finishedAt?: string;
  answers: Array<{
    questionId: string;
    answeredAt: string;
    optionIds: string[];
  }>;
  startLocation: LocationClaim;
  finishLocation?: LocationClaim;
  status: 'active' | 'pending';
}
export interface OfflineReceipt {
  clientAttemptId: string;
  playerId: string;
  title: string;
  outcome: string;
  attemptId?: string;
  receivedAt: number;
  eventId?: string;
}
interface OfflineDB extends DBSchema {
  sessions: {
    key: string;
    value: { playerId: string; playerName: string; verifiedAt: number };
  };
  packs: { key: string; value: CachedPack };
  attempts: { key: string; value: LocalAttempt };
  receipts: { key: string; value: OfflineReceipt };
  catalogues: {
    key: string;
    value: { playerId: string; events: PlayerEvent[]; savedAt: number };
  };
}
const database = () =>
  openDB<OfflineDB>('wits-world-offline', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions'))
        db.createObjectStore('sessions', { keyPath: 'playerId' });
      if (!db.objectStoreNames.contains('packs'))
        db.createObjectStore('packs', { keyPath: 'pack.packId' });
      if (!db.objectStoreNames.contains('attempts'))
        db.createObjectStore('attempts', { keyPath: 'clientAttemptId' });
      if (!db.objectStoreNames.contains('receipts'))
        db.createObjectStore('receipts', { keyPath: 'clientAttemptId' });
      if (!db.objectStoreNames.contains('catalogues'))
        db.createObjectStore('catalogues', { keyPath: 'playerId' });
    },
  });

export function boundOfflinePlayer(): string | null {
  try {
    return localStorage.getItem('wits-world.authenticated-player-id');
  } catch {
    return null;
  }
}
export async function saveOfflineSession(playerId: string, playerName: string) {
  const db = await database();
  if (boundOfflinePlayer() !== playerId) return;
  await db.put('sessions', { playerId, playerName, verifiedAt: Date.now() });
}
export async function readOfflineState() {
  const playerId = boundOfflinePlayer();
  if (!playerId)
    return { session: undefined, packs: [], attempts: [], receipts: [] };
  const db = await database();
  const session = await db.get('sessions', playerId);
  const packs = (await db.getAll('packs')).filter(
    (item) =>
      item.pack.playerId === playerId &&
      Number.isFinite(Date.parse(item.pack.validUntil)),
  );
  const attempts = (await db.getAll('attempts')).filter(
    (item) => item.playerId === playerId,
  );
  const receipts = (await db.getAll('receipts')).filter(
    (item) => item.playerId === playerId,
  );
  if (boundOfflinePlayer() !== playerId)
    return { session: undefined, packs: [], attempts: [], receipts: [] };
  return { session, packs, attempts, receipts };
}
export async function saveOfflineCatalogue(
  playerId: string,
  events: PlayerEvent[],
) {
  if (boundOfflinePlayer() !== playerId) return;
  if (
    new TextEncoder().encode(JSON.stringify(events)).length >
    OFFLINE_CONTENT_BUDGET_BYTES
  )
    throw new Error('The event catalogue exceeds the offline storage budget.');
  const db = await database();
  if (boundOfflinePlayer() !== playerId) return;
  await db.put('catalogues', { playerId, events, savedAt: Date.now() });
}
export async function readOfflineCatalogue() {
  const playerId = boundOfflinePlayer();
  if (!playerId) return null;
  const db = await database();
  const value = await db.get('catalogues', playerId);
  return boundOfflinePlayer() === playerId ? (value ?? null) : null;
}
export async function replacePacks(playerId: string, packs: CachedPack[]) {
  const db = await database();
  if (boundOfflinePlayer() !== playerId) return;
  const tx = db.transaction(['packs', 'receipts'], 'readwrite');
  for (const item of await tx.objectStore('packs').getAll()) {
    if (
      item.pack.playerId === playerId ||
      Date.parse(item.pack.validUntil) <= Date.now()
    )
      await tx.objectStore('packs').delete(item.pack.packId);
  }
  let bytes = 0;
  for (const item of packs) {
    if (item.pack.playerId !== playerId) continue;
    bytes += new TextEncoder().encode(JSON.stringify(item)).length;
    if (bytes > OFFLINE_CONTENT_BUDGET_BYTES) break;
    await tx.objectStore('packs').put(item);
  }
  for (const receipt of await tx.objectStore('receipts').getAll()) {
    if (Date.now() - receipt.receivedAt > 7 * 86400_000)
      await tx.objectStore('receipts').delete(receipt.clientAttemptId);
  }
  await tx.done;
}
export async function createLocalAttempt(
  cached: CachedPack,
  location: LocationClaim,
) {
  const db = await database();
  if (boundOfflinePlayer() !== cached.pack.playerId)
    throw new Error('Sign in with the original account.');
  const tx = db.transaction('attempts', 'readwrite');
  const existing = (await tx.store.getAll()).find(
    (item) =>
      item.playerId === cached.pack.playerId &&
      item.cached.pack.event.eventId === cached.pack.event.eventId,
  );
  if (existing) {
    await tx.done;
    return existing;
  }
  const now = Date.now();
  if (
    now < Date.parse(cached.pack.validFrom) ||
    now >= Date.parse(cached.pack.validUntil)
  )
    throw new Error(
      'This download is not currently available. Reconnect to refresh it.',
    );
  checkOfflineLocation(location, cached.pack.event, true, {
    now,
    maxAgeMs:
      cached.pack.locationPolicy === 'arrival-v1'
        ? OFFLINE_ARRIVAL_WINDOW_MS
        : OFFLINE_LOCATION_MAX_AGE_MS,
    validFrom:
      cached.pack.locationPolicy === 'arrival-v1'
        ? cached.pack.validFrom
        : undefined,
  });
  const attempt: LocalAttempt = {
    clientAttemptId: crypto.randomUUID(),
    playerId: cached.pack.playerId,
    cached,
    startedAt: new Date(now).toISOString(),
    answers: [],
    startLocation: location,
    status: 'active',
  };
  await tx.store.add(attempt);
  await tx.done;
  return attempt;
}
export async function saveLocalAnswer(
  id: string,
  questionId: string,
  optionIds: string[],
) {
  const db = await database();
  const tx = db.transaction('attempts', 'readwrite');
  const attempt = await tx.store.get(id);
  if (!attempt || attempt.playerId !== boundOfflinePlayer())
    throw new Error('Sign in with the original account.');
  if (
    Date.now() <
    Date.parse(attempt.answers.at(-1)?.answeredAt ?? attempt.startedAt)
  )
    throw new Error(
      'The device clock moved backwards. Restore automatic date and time before continuing.',
    );
  if (
    attempt.status !== 'active' ||
    Date.now() >=
      Date.parse(attempt.startedAt) +
        attempt.cached.pack.timeLimitSeconds * 1000
  )
    throw new Error('Time has ended.');
  const question = attempt.cached.pack.questions[attempt.answers.length];
  if (!question) throw new Error('All answers have already been saved.');
  if (question.id !== questionId)
    throw new Error(
      'This question was already answered in another tab. Reopen the attempt.',
    );
  if (
    optionIds.length !== (attempt.cached.pack.format === 'ordering' ? 4 : 1) ||
    new Set(optionIds).size !== optionIds.length ||
    optionIds.some((id) => !question.options.some((option) => option.id === id))
  )
    throw new Error('Choose a valid answer.');
  attempt.answers.push({
    questionId: question.id,
    answeredAt: new Date().toISOString(),
    optionIds,
  });
  await tx.store.put(attempt);
  await tx.done;
  return attempt;
}
export async function finishLocalAttempt(id: string, location?: LocationClaim) {
  const db = await database();
  const tx = db.transaction('attempts', 'readwrite');
  const attempt = await tx.store.get(id);
  if (!attempt || attempt.playerId !== boundOfflinePlayer())
    throw new Error('Sign in with the original account.');
  if (attempt.status === 'active') {
    if (!location && attempt.cached.pack.locationPolicy !== 'arrival-v1')
      throw new Error(
        'This older saved challenge still needs a finishing location.',
      );
    const now = Date.now();
    if (
      now < Date.parse(attempt.answers.at(-1)?.answeredAt ?? attempt.startedAt)
    )
      throw new Error(
        'The device clock moved backwards. Restore automatic date and time before continuing.',
      );
    if (
      attempt.answers.length < attempt.cached.pack.questions.length &&
      now <
        Date.parse(attempt.startedAt) +
          attempt.cached.pack.timeLimitSeconds * 1000
    )
      throw new Error(
        'Continue answering before finishing this challenge. The original timer still applies.',
      );
    if (location && attempt.cached.pack.locationPolicy !== 'arrival-v1')
      checkOfflineLocation(location, attempt.cached.pack.event, false, {
        now,
        previousAcquiredAt: attempt.startLocation.acquiredAt,
      });
    attempt.status = 'pending';
    attempt.finishedAt = new Date(now).toISOString();
    if (location) attempt.finishLocation = location;
    await tx.store.put(attempt);
  }
  await tx.done;
  return attempt;
}
export async function recordOfflineReceipt(
  attempt: LocalAttempt,
  outcome: string,
  attemptId?: string,
) {
  const db = await database();
  const tx = db.transaction(['attempts', 'receipts', 'packs'], 'readwrite');
  await tx.objectStore('receipts').put({
    clientAttemptId: attempt.clientAttemptId,
    playerId: attempt.playerId,
    title: attempt.cached.pack.event.title,
    outcome,
    attemptId,
    receivedAt: Date.now(),
    eventId: attempt.cached.pack.event.eventId,
  });
  await tx.objectStore('attempts').delete(attempt.clientAttemptId);
  await tx.objectStore('packs').delete(attempt.cached.pack.packId);
  await tx.done;
}
export async function clearOfflineData(playerId?: string) {
  const db = await database();
  const tx = db.transaction(
    ['sessions', 'packs', 'attempts', 'receipts', 'catalogues'],
    'readwrite',
  );
  for (const name of Array.from(tx.objectStoreNames)) {
    const store = tx.objectStore(name);
    if (!playerId) await store.clear();
    else {
      let cursor = await store.openCursor();
      while (cursor) {
        const value = cursor.value;
        if (
          ('pack' in value ? value.pack.playerId : value.playerId) === playerId
        )
          await cursor.delete();
        cursor = await cursor.continue();
      }
    }
  }
  await tx.done;
}
export type OfflineCleanupResult = 'cleared' | 'cancelled' | 'cleanup_failed';

export async function confirmOfflineSignOut(
  action = 'sign out',
): Promise<OfflineCleanupResult> {
  try {
    const state = await readOfflineState();
    if (
      state?.attempts.length &&
      !window.confirm(
        `This will remove offline attempts that have not synced. Continue to ${action} and discard them?`,
      )
    )
      return 'cancelled';
    await clearOfflineData();
    return 'cleared';
  } catch {
    return window.confirm(
      `Offline data could not be checked or removed. Saved answers and precise location data may remain on this device even after you ${action}. Clear this site’s data in your browser settings before leaving a shared device. Continue to ${action} anyway?`,
    )
      ? 'cleanup_failed'
      : 'cancelled';
  }
}
