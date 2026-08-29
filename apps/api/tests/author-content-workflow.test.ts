import { describe, expect, it, vi } from 'vitest';

import {
  AUTHOR_CONTENT_STATUSES,
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  InvalidAuthorContentNoteError,
  SelfReviewForbiddenError,
  StaleAuthorContentVersionError,
  assertDraftVersion,
  normalizeAuthorContentNote,
  transitionAuthorContent,
  type AuthorContentClient,
  type AuthorContentStatus,
  type PublicationProvenance,
  type TransitionAuthorContentInput,
} from '../src/authoring/content-workflow.js';

const entityId = '10000000-0000-4000-8000-000000000001';
const submitterId = '20000000-0000-4000-8000-000000000001';
const reviewerId = '20000000-0000-4000-8000-000000000002';
const entityTypes = ['event', 'challenge', 'question', 'card'] as const;
const allowedTransitions = [
  { action: 'submit', from: 'draft', to: 'in_review', version: 0 },
  { action: 'approve', from: 'in_review', to: 'approved', version: 1 },
  { action: 'return', from: 'in_review', to: 'draft', version: 1 },
  { action: 'return', from: 'approved', to: 'draft', version: 2 },
  { action: 'publish', from: 'approved', to: 'published', version: 2 },
  { action: 'retire', from: 'published', to: 'retired', version: 3 },
] as const;

describe('Author content workflow', () => {
  it.each(
    entityTypes.flatMap((entityType) =>
      allowedTransitions.map((transition) => ({ entityType, ...transition })),
    ),
  )(
    'allows $entityType $from -> $to through $action',
    async ({ action, entityType, from, to, version }) => {
      const { client, query } = createClient({
        provenance: from === 'published' ? 'reviewed' : null,
        reviewedBy:
          from === 'approved' || from === 'published' ? reviewerId : null,
        status: from,
        submittedBy: from === 'draft' ? null : submitterId,
        version,
      });

      await expect(
        transitionAuthorContent(client, {
          action,
          actorPlayerId: action === 'submit' ? submitterId : reviewerId,
          entityId,
          entityType,
          expectedVersion: version,
          note:
            action === 'return' ? 'Please revise this submission.' : undefined,
        }),
      ).resolves.toMatchObject({ status: to, version: version + 1 });

      expect(
        query.mock.calls.filter(([statement]) =>
          String(statement).includes('insert into public.author_content_audit'),
        ),
      ).toHaveLength(1);
    },
  );

  it.each(
    entityTypes.flatMap((entityType) =>
      AUTHOR_CONTENT_STATUSES.flatMap((status) =>
        ['submit', 'approve', 'return', 'publish', 'retire']
          .filter(
            (action) =>
              !allowedTransitions.some(
                (allowed) =>
                  allowed.action === action && allowed.from === status,
              ),
          )
          .map((action) => ({
            action: action as TransitionAuthorContentInput['action'],
            entityType,
            status,
          })),
      ),
    ),
  )(
    'rejects invalid $entityType $status -> $action shortcuts and reversals',
    async ({ action, entityType, status }) => {
      const { client, query } = createClient({
        provenance:
          status === 'published' || status === 'retired' ? 'reviewed' : null,
        reviewedBy:
          status === 'approved' ||
          status === 'published' ||
          status === 'retired'
            ? reviewerId
            : null,
        status,
        submittedBy: status === 'draft' ? null : submitterId,
        version: 7,
      });

      await expect(
        transitionAuthorContent(client, {
          action,
          actorPlayerId: reviewerId,
          entityId,
          entityType,
          expectedVersion: 7,
          note: action === 'return' ? 'Invalid return attempt.' : undefined,
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);
      expect(
        query.mock.calls.some(([statement]) =>
          String(statement).startsWith('update '),
        ),
      ).toBe(false);
    },
  );

  it('submits a draft with latest-submitter metadata, one version increment, and one audit row', async () => {
    const { client, query } = createClient({ status: 'draft', version: 4 });

    await expect(
      transitionAuthorContent(client, {
        action: 'submit',
        actorPlayerId: submitterId,
        entityId,
        entityType: 'card',
        expectedVersion: 4,
        note: ' Ready for a second pair of eyes. ',
      }),
    ).resolves.toMatchObject({
      publicationProvenance: null,
      reviewedBy: null,
      status: 'in_review',
      submittedBy: submitterId,
      version: 5,
    });

    const auditCall = query.mock.calls.find(([statement]) =>
      String(statement).includes('insert into public.author_content_audit'),
    );
    expect(auditCall?.[1]).toEqual([
      submitterId,
      'card',
      entityId,
      'submit',
      'draft',
      'in_review',
      'Ready for a second pair of eyes.',
      5,
    ]);
  });

  it('rejects stale versions before changing content', async () => {
    const { client, query } = createClient({ status: 'draft', version: 5 });

    await expect(
      transitionAuthorContent(client, {
        action: 'submit',
        actorPlayerId: submitterId,
        entityId,
        entityType: 'event',
        expectedVersion: 4,
      }),
    ).rejects.toBeInstanceOf(StaleAuthorContentVersionError);
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).startsWith('update '),
      ),
    ).toBe(false);
  });

  it.each(['approve', 'return'] as const)(
    'forbids a submitter from performing %s on their own latest submission',
    async (action) => {
      const { client, query } = createClient({
        status: 'in_review',
        submittedBy: submitterId,
        version: 1,
      });

      await expect(
        transitionAuthorContent(client, {
          action,
          actorPlayerId: submitterId,
          entityId,
          entityType: 'card',
          expectedVersion: 1,
          note: action === 'return' ? 'Needs correction.' : undefined,
        }),
      ).rejects.toBeInstanceOf(SelfReviewForbiddenError);
      expect(
        query.mock.calls.some(([statement]) =>
          String(statement).startsWith('update '),
        ),
      ).toBe(false);
    },
  );

  it('approves ready content by a different Author and records reviewer metadata', async () => {
    const { client } = createClient({
      status: 'in_review',
      submittedBy: submitterId,
      version: 1,
    });

    await expect(
      transitionAuthorContent(client, {
        action: 'approve',
        actorPlayerId: reviewerId,
        entityId,
        entityType: 'card',
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({
      reviewedBy: reviewerId,
      status: 'approved',
      submittedBy: submitterId,
      version: 2,
    });
  });

  it.each([
    { reviewedBy: null, status: 'in_review' as const, version: 1 },
    { reviewedBy: reviewerId, status: 'approved' as const, version: 2 },
  ])(
    'returns $status content to a clean draft with a trimmed required reason',
    async ({ reviewedBy, status, version }) => {
      const { client } = createClient({
        reviewedBy,
        status,
        submittedBy: submitterId,
        version,
      });

      await expect(
        transitionAuthorContent(client, {
          action: 'return',
          actorPlayerId: reviewerId,
          entityId,
          entityType: 'event',
          expectedVersion: version,
          note: ' Correct the active-time window. ',
        }),
      ).resolves.toMatchObject({
        publicationProvenance: null,
        reviewedAt: null,
        reviewedBy: null,
        status: 'draft',
        submittedAt: null,
        submittedBy: null,
        version: version + 1,
      });
    },
  );

  it('rechecks readiness before publication and leaves an approved record unchanged on failure', async () => {
    const { client, query } = createClient({
      cardItemCount: 3,
      reviewedBy: reviewerId,
      status: 'approved',
      submittedBy: submitterId,
      version: 2,
    });

    await expect(
      transitionAuthorContent(client, {
        action: 'publish',
        actorPlayerId: submitterId,
        entityId,
        entityType: 'card',
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(AuthorContentNotReadyError);
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).startsWith('update '),
      ),
    ).toBe(false);
  });

  it('publishes approved content with reviewed provenance and permits later retirement', async () => {
    const approved = createClient({
      reviewedBy: reviewerId,
      status: 'approved',
      submittedBy: submitterId,
      version: 2,
    });
    await expect(
      transitionAuthorContent(approved.client, {
        action: 'publish',
        actorPlayerId: submitterId,
        entityId,
        entityType: 'card',
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({
      publicationProvenance: 'reviewed',
      status: 'published',
      version: 3,
    });

    const published = createClient({
      provenance: 'reviewed',
      reviewedBy: reviewerId,
      status: 'published',
      submittedBy: submitterId,
      version: 3,
    });
    await expect(
      transitionAuthorContent(published.client, {
        action: 'retire',
        actorPlayerId: reviewerId,
        entityId,
        entityType: 'card',
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({
      publicationProvenance: 'reviewed',
      status: 'retired',
      version: 4,
    });
  });

  it('locks published sibling questions before deciding whether retirement preserves readiness', async () => {
    const { client, query } = createClient({
      parentStatus: 'published',
      provenance: 'reviewed',
      remainingPublishedQuestionCount: 5,
      reviewedBy: reviewerId,
      status: 'published',
      submittedBy: submitterId,
      version: 3,
    });

    await expect(
      transitionAuthorContent(client, {
        action: 'retire',
        actorPlayerId: reviewerId,
        entityId,
        entityType: 'question',
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({ status: 'retired', version: 4 });

    const statements = query.mock.calls.map(([statement]) => String(statement));
    const siblingLock = statements.findIndex((statement) =>
      statement.includes('select sibling.id'),
    );
    const readinessCount = statements.findIndex((statement) =>
      statement.includes('published_count'),
    );
    expect(siblingLock).toBeGreaterThanOrEqual(0);
    expect(siblingLock).toBeLessThan(readinessCount);
  });

  it('rejects lifecycle shortcuts and reversals', async () => {
    const { client } = createClient({ status: 'draft', version: 0 });
    await expect(
      transitionAuthorContent(client, {
        action: 'publish',
        actorPlayerId: submitterId,
        entityId,
        entityType: 'event',
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(AuthorContentStateConflictError);
  });

  it('validates edit versions and bounded notes safely', () => {
    expect(() =>
      assertDraftVersion({ status: 'approved', version: 2 }, 2),
    ).toThrow(AuthorContentStateConflictError);
    expect(() =>
      assertDraftVersion({ status: 'draft', version: 2 }, 1),
    ).toThrow(StaleAuthorContentVersionError);
    expect(() => normalizeAuthorContentNote('   ', true)).toThrow(
      InvalidAuthorContentNoteError,
    );
    expect(() => normalizeAuthorContentNote('x'.repeat(1001), false)).toThrow(
      InvalidAuthorContentNoteError,
    );
  });
});

function createClient(options: {
  status: AuthorContentStatus;
  version: number;
  submittedBy?: string | null;
  reviewedBy?: string | null;
  provenance?: PublicationProvenance | null;
  cardItemCount?: number;
  parentStatus?: AuthorContentStatus;
  remainingPublishedQuestionCount?: number;
}) {
  const current = {
    publication_provenance: options.provenance ?? null,
    reviewed_at: options.reviewedBy
      ? new Date('2026-08-29T08:05:00.000Z')
      : null,
    reviewed_by_player_id: options.reviewedBy ?? null,
    status: options.status,
    submitted_at: options.submittedBy
      ? new Date('2026-08-29T08:00:00.000Z')
      : null,
    submitted_by_player_id: options.submittedBy ?? null,
    version: options.version,
  };

  const query = vi.fn(async (statement: string, values?: unknown[]) => {
    if (statement.includes('select rarity from public.card_definitions')) {
      return { rows: [{ rarity: 'rare' }] };
    }
    if (statement.includes('for update')) return { rows: [current] };
    if (statement.includes('select challenge.status')) {
      return { rows: [{ status: options.parentStatus ?? 'draft' }] };
    }
    if (statement.includes('select event.authoring_status status')) {
      return { rows: [{ status: 'draft' }] };
    }
    if (statement.includes('count(question.id)::int as question_count')) {
      return { rows: [{ other_published_count: 0, question_count: 5 }] };
    }
    if (statement.includes('published_count')) {
      return {
        rows: [
          {
            published_count: options.remainingPublishedQuestionCount ?? 0,
          },
        ],
      };
    }
    if (
      statement.includes('from public.event_challenges\n     where event_id')
    ) {
      return { rows: [{ id: '30000000-0000-4000-8000-000000000001' }] };
    }
    if (
      statement.includes(
        'from public.challenge_questions\n     where challenge_id',
      )
    ) {
      return {
        rows: Array.from({ length: 5 }, (_, index) => ({
          id: `40000000-0000-4000-8000-00000000000${index + 1}`,
        })),
      };
    }
    if (statement.includes('select challenge.format, question.explanation')) {
      return {
        rows: [
          {
            answer_count: 1,
            choice_count: 4,
            explanation: 'Complete explanation.',
            format: 'multiple_choice',
            ordering_answer_count: 0,
            ordering_item_count: 0,
          },
        ],
      };
    }
    if (statement.includes('from public.challenge_choices where')) {
      return { rows: Array.from({ length: 4 }, (_, id) => ({ id })) };
    }
    if (statement.includes('from private.challenge_answer_keys where')) {
      return { rows: [{ question_id: entityId }] };
    }
    if (statement.includes('from public.challenge_ordering_items where')) {
      return { rows: [] };
    }
    if (
      statement.includes('from private.challenge_ordering_answer_keys where')
    ) {
      return { rows: [] };
    }
    if (
      statement.includes("where rarity = 'common'") &&
      statement.includes('order by id for share')
    ) {
      return { rows: [{ id: '50000000-0000-4000-8000-000000000001' }] };
    }
    if (statement.includes('from public.card_moves where')) {
      return {
        rows: Array.from({ length: options.cardItemCount ?? 4 }, (_, id) => ({
          id,
        })),
      };
    }
    if (statement.includes('from public.card_effects where'))
      return { rows: [] };
    if (statement.includes('select card.category')) {
      return {
        rows: [
          {
            category: 'creature',
            invalid_count: 0,
            item_count: options.cardItemCount ?? 4,
          },
        ],
      };
    }
    if (statement.startsWith('update ')) {
      const nextStatus = values?.[2] as AuthorContentStatus;
      return {
        rows: [
          {
            publication_provenance: values?.[7] ?? null,
            reviewed_at: values?.[6] ? new Date(String(values[6])) : null,
            reviewed_by_player_id: values?.[5] ?? null,
            status: nextStatus,
            submitted_at: values?.[4] ? new Date(String(values[4])) : null,
            submitted_by_player_id: values?.[3] ?? null,
            version: options.version + 1,
          },
        ],
      };
    }
    return { rows: [] };
  });

  return { client: { query } as AuthorContentClient, query };
}
