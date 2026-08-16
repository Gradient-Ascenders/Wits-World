import { useEffect, useRef, useSyncExternalStore } from 'react';

export type AuthorCollectionKey =
  'cards' | 'events' | `challenges:${string}` | `questions:${string}`;

export type AuthorRecordKey =
  | `card:${string}`
  | `challenge:${string}`
  | `event:${string}`
  | `question:${string}`;

export type AuthorRecordKind = 'card' | 'challenge' | 'event' | 'question';

export interface AuthorMutationTicket {
  readonly collectionKey: AuthorCollectionKey;
  readonly draftGeneration: number;
  readonly mutationGeneration: number;
  readonly operationKey: string;
}

export interface AuthorMutationResult<T> {
  readonly collectionKey: AuthorCollectionKey;
  readonly draftGeneration: number;
  readonly mutationGeneration: number;
  readonly operationKey: string;
  readonly recordKey: AuthorRecordKey;
  readonly sequence: number;
  readonly value: T;
}

export interface AuthorDraftSession {
  readonly id: number;
  readonly recordKey: AuthorRecordKey;
}

interface ActiveDraft {
  dirty: boolean;
  generation: number;
}

interface UncertainCollection {
  sequence: number;
}

export class AuthorMutationCoordinator {
  private readonly activeDrafts = new Map<
    AuthorRecordKey,
    Map<number, ActiveDraft>
  >();
  private readonly draftGenerations = new Map<AuthorRecordKey, number>();
  private readonly listeners = new Set<() => void>();
  private readonly mutationGenerations = new Map<string, number>();
  private readonly results = new Map<
    AuthorRecordKey,
    AuthorMutationResult<unknown>
  >();
  private readonly uncertainCollections = new Map<
    AuthorCollectionKey,
    UncertainCollection
  >();
  private nextDraftSessionId = 0;
  private nextOperationId = 0;
  private revision = 0;
  private sequence = 0;

  public beginMutation(
    recordKey: AuthorRecordKey,
    collectionKey: AuthorCollectionKey,
  ): AuthorMutationTicket {
    const mutationGeneration =
      (this.mutationGenerations.get(recordKey) ?? 0) + 1;
    this.mutationGenerations.set(recordKey, mutationGeneration);
    this.results.delete(recordKey);
    this.emit();
    return {
      collectionKey,
      draftGeneration: this.draftGenerations.get(recordKey) ?? 0,
      mutationGeneration,
      operationKey: recordKey,
    };
  }

  public beginCreate(
    kind: AuthorRecordKind,
    collectionKey: AuthorCollectionKey,
  ): AuthorMutationTicket {
    this.nextOperationId += 1;
    const operationKey = `${kind}:new:${this.nextOperationId}`;
    this.mutationGenerations.set(operationKey, 1);
    return {
      collectionKey,
      draftGeneration: 0,
      mutationGeneration: 1,
      operationKey,
    };
  }

  public acceptSuccess<T>(
    ticket: AuthorMutationTicket,
    recordKey: AuthorRecordKey,
    value: T,
  ): boolean {
    if (!this.isLatest(ticket)) return false;
    this.sequence += 1;
    this.results.set(recordKey, {
      ...ticket,
      recordKey,
      sequence: this.sequence,
      value,
    });
    this.emit();
    return true;
  }

  public acceptFailure(
    ticket: AuthorMutationTicket,
    uncertain: boolean,
  ): boolean {
    if (!this.isLatest(ticket)) return false;
    if (uncertain) {
      this.sequence += 1;
      this.uncertainCollections.set(ticket.collectionKey, {
        sequence: this.sequence,
      });
      this.emit();
    }
    return true;
  }

  public beginCollectionLoad(): number {
    return this.sequence;
  }

  public completeCollectionLoad(
    collectionKey: AuthorCollectionKey,
    startedAt: number,
  ): void {
    let changed = false;
    for (const [recordKey, result] of this.results) {
      if (
        result.collectionKey === collectionKey &&
        result.sequence <= startedAt
      ) {
        this.results.delete(recordKey);
        changed = true;
      }
    }
    const uncertain = this.uncertainCollections.get(collectionKey);
    if (uncertain && uncertain.sequence <= startedAt) {
      this.uncertainCollections.delete(collectionKey);
      changed = true;
    }
    if (changed) this.emit();
  }

  public getResults<T>(
    collectionKey: AuthorCollectionKey,
  ): readonly AuthorMutationResult<T>[] {
    return [...this.results.values()].flatMap((result) =>
      result.collectionKey === collectionKey &&
      this.isCurrentResult(result) &&
      !this.hasNewerDirtyDraft(result)
        ? [result as AuthorMutationResult<T>]
        : [],
    );
  }

  public isCollectionUncertain(collectionKey: AuthorCollectionKey): boolean {
    return this.uncertainCollections.has(collectionKey);
  }

  public openDraft(recordKey: AuthorRecordKey): AuthorDraftSession {
    this.nextDraftSessionId += 1;
    const session = { id: this.nextDraftSessionId, recordKey };
    const drafts = this.activeDrafts.get(recordKey) ?? new Map();
    drafts.set(session.id, {
      dirty: false,
      generation: this.draftGenerations.get(recordKey) ?? 0,
    });
    this.activeDrafts.set(recordKey, drafts);
    return session;
  }

  public setDraftDirty(session: AuthorDraftSession, dirty: boolean): void {
    const draft = this.activeDrafts.get(session.recordKey)?.get(session.id);
    if (!draft || draft.dirty === dirty) return;
    if (dirty) {
      const generation =
        (this.draftGenerations.get(session.recordKey) ?? 0) + 1;
      this.draftGenerations.set(session.recordKey, generation);
      draft.generation = generation;
    }
    draft.dirty = dirty;
    this.emit();
  }

  public closeDraft(session: AuthorDraftSession): void {
    const drafts = this.activeDrafts.get(session.recordKey);
    if (!drafts?.delete(session.id)) return;
    if (drafts.size === 0) this.activeDrafts.delete(session.recordKey);
    this.emit();
  }

  public getRevision = (): number => this.revision;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  private hasNewerDirtyDraft(result: AuthorMutationResult<unknown>): boolean {
    const drafts = this.activeDrafts.get(result.recordKey);
    return Boolean(
      drafts &&
      [...drafts.values()].some(
        (draft) => draft.dirty && draft.generation > result.draftGeneration,
      ),
    );
  }

  private isCurrentResult(result: AuthorMutationResult<unknown>): boolean {
    return (
      this.mutationGenerations.get(result.operationKey) ===
      result.mutationGeneration
    );
  }

  private isLatest(ticket: AuthorMutationTicket): boolean {
    return (
      this.mutationGenerations.get(ticket.operationKey) ===
      ticket.mutationGeneration
    );
  }
}

export function useAuthorMutationRevision(
  coordinator: AuthorMutationCoordinator,
): number {
  return useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getRevision,
    coordinator.getRevision,
  );
}

export function useAuthorDraftSession(
  coordinator: AuthorMutationCoordinator,
  recordKey: AuthorRecordKey,
  dirty: boolean,
): void {
  const sessionRef = useRef<AuthorDraftSession | null>(null);

  useEffect(() => {
    const session = coordinator.openDraft(recordKey);
    sessionRef.current = session;
    return () => {
      sessionRef.current = null;
      coordinator.closeDraft(session);
    };
  }, [coordinator, recordKey]);

  useEffect(() => {
    if (sessionRef.current)
      coordinator.setDraftDirty(sessionRef.current, dirty);
  }, [coordinator, dirty]);
}

export function reconcileAuthorMutationResults<T>(
  current: T[],
  results: readonly AuthorMutationResult<T>[],
  getId: (value: T) => string,
  applied: Map<AuthorRecordKey, number>,
  replay = false,
  appendNew = false,
): T[] {
  let next = current;
  for (const result of results) {
    if (!replay && (applied.get(result.recordKey) ?? 0) >= result.sequence)
      continue;
    const id = getId(result.value);
    next = next.some((value) => getId(value) === id)
      ? next.map((value) => (getId(value) === id ? result.value : value))
      : appendNew
        ? [...next, result.value]
        : [result.value, ...next];
    applied.set(result.recordKey, result.sequence);
  }
  return next;
}
