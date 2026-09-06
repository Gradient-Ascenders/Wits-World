import { openDB, type DBSchema } from 'idb';
import type { LocationClaim } from '../browser-location';

export interface OfflinePack {
  version: 1;
  packId: string;
  playerId: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
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
}
interface OfflineDB extends DBSchema {
  sessions: {
    key: string;
    value: { playerId: string; playerName: string; verifiedAt: number };
  };
  packs: { key: string; value: CachedPack };
  attempts: { key: string; value: LocalAttempt };
  receipts: { key: string; value: OfflineReceipt };
}
const database = () =>
  openDB<OfflineDB>('wits-world-offline', 1, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'playerId' });
      db.createObjectStore('packs', { keyPath: 'pack.packId' });
      db.createObjectStore('attempts', { keyPath: 'clientAttemptId' });
      db.createObjectStore('receipts', { keyPath: 'clientAttemptId' });
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
      Date.parse(item.pack.validUntil) > Date.now(),
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
  for (const item of packs.slice(0, 10)) {
    if (item.pack.playerId === playerId)
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
  const attempt: LocalAttempt = {
    clientAttemptId: crypto.randomUUID(),
    playerId: cached.pack.playerId,
    cached,
    startedAt: new Date().toISOString(),
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
export async function finishLocalAttempt(id: string, location: LocationClaim) {
  const db = await database();
  const tx = db.transaction('attempts', 'readwrite');
  const attempt = await tx.store.get(id);
  if (!attempt || attempt.playerId !== boundOfflinePlayer())
    throw new Error('Sign in with the original account.');
  if (attempt.status === 'active') {
    attempt.status = 'pending';
    attempt.finishedAt = new Date().toISOString();
    attempt.finishLocation = location;
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
  });
  await tx.objectStore('attempts').delete(attempt.clientAttemptId);
  await tx.objectStore('packs').delete(attempt.cached.pack.packId);
  await tx.done;
}
export async function clearOfflineData(playerId?: string) {
  const db = await database();
  const tx = db.transaction(
    ['sessions', 'packs', 'attempts', 'receipts'],
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
export async function confirmOfflineSignOut() {
  const state = await readOfflineState().catch(() => null);
  if (
    state?.attempts.length &&
    !window.confirm(
      'Signing out will remove offline attempts that have not synced. Sign out and discard them?',
    )
  )
    return false;
  await clearOfflineData().catch(() => undefined);
  return true;
}
