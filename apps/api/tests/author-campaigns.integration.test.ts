import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { AuthorContentNotReadyError } from '../src/authoring/content-workflow.js';
import type {
  AuthorCampaign,
  AuthorCampaignService,
} from '../src/campaigns/author-campaign-service.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const AUTHOR_ID = '18300000-0000-4000-8000-000000000001';
const CAMPAIGN_ID = '18310000-0000-4000-8000-000000000001';
const EVENT_ID = '18320000-0000-4000-8000-000000000001';
const TRAIL_ID = '18330000-0000-4000-8000-000000000001';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const activeAuthor = {
  id: AUTHOR_ID,
  role: 'author' as const,
  playerName: 'campaign-author',
  lifecycleStatus: 'active' as const,
};

const campaign: AuthorCampaign = {
  campaignId: CAMPAIGN_ID,
  title: 'September Open Day',
  description: 'Campus discovery during Open Day.',
  status: 'draft',
  startsAt: '2026-09-05T08:00:00.000Z',
  endsAt: '2026-09-05T16:00:00.000Z',
  version: 0,
  submittedBy: null,
  submittedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  publicationProvenance: null,
  publishedAt: null,
  retiredAt: null,
  createdAt: '2026-08-29T12:00:00.000Z',
  updatedAt: '2026-08-29T12:00:00.000Z',
  events: [
    {
      eventId: EVENT_ID,
      title: 'Great Hall Welcome',
      authoringStatus: 'published',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-30T00:00:00.000Z',
    },
  ],
  trails: [
    {
      trailId: TRAIL_ID,
      title: 'Open Day Route',
      status: 'published',
    },
  ],
};

let app: FastifyInstance;
let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;
let service: AuthorCampaignService;

beforeEach(async () => {
  resolvePlayer = vi.fn(async () => activeAuthor);
  service = {
    listCampaigns: vi.fn(async () => [campaign]),
    createCampaign: vi.fn(async () => campaign),
    updateCampaign: vi.fn(async () => ({ ...campaign, version: 1 })),
    submitCampaign: vi.fn(async (): Promise<AuthorCampaign> => ({
      ...campaign,
      status: 'in_review',
      version: 1,
      submittedBy: AUTHOR_ID,
      submittedAt: '2026-08-29T12:05:00.000Z',
    })),
    approveCampaign: vi.fn(async (): Promise<AuthorCampaign> => ({
      ...campaign,
      status: 'approved',
      version: 2,
    })),
    returnCampaign: vi.fn(async (): Promise<AuthorCampaign> => ({
      ...campaign,
      version: 2,
    })),
    publishCampaign: vi.fn(async (): Promise<AuthorCampaign> => ({
      ...campaign,
      status: 'published',
      version: 3,
      publicationProvenance: 'reviewed',
      publishedAt: '2026-08-29T12:10:00.000Z',
    })),
    retireCampaign: vi.fn(async (): Promise<AuthorCampaign> => ({
      ...campaign,
      status: 'retired',
      version: 4,
      publicationProvenance: 'reviewed',
      publishedAt: '2026-08-29T12:10:00.000Z',
      retiredAt: '2026-09-06T00:00:00.000Z',
    })),
  };
  const verifier: AccessTokenVerifier = {
    verify: vi.fn(async () => ({
      connectionStrategy: 'auth0' as const,
      issuer: authConfig.issuer,
      subject: 'auth0|campaign-author',
      playerName: 'campaign-author',
    })),
  };
  app = await buildApp({
    authConfig,
    accessTokenVerifier: verifier,
    playerIdentityService: { resolve: resolvePlayer },
    authorContentServices: { campaigns: service },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('author campaign API', () => {
  it('requires an authenticated active Author', async () => {
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/v1/author/campaigns',
    });
    expect(unauthenticated.statusCode).toBe(401);

    resolvePlayer.mockResolvedValueOnce({
      ...activeAuthor,
      role: 'player',
    });
    const ordinaryPlayer = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/campaigns',
    });
    expect(ordinaryPlayer.statusCode).toBe(403);
    expect(ordinaryPlayer.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
  });

  it('lists campaign schedules and safe member summaries', async () => {
    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/campaigns',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      campaigns: [campaign],
      requestId: expect.any(String),
    });
  });

  it('creates an empty or populated draft using token-derived identity', async () => {
    const body = validCampaignBody();
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/campaigns',
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    expect(service.createCampaign).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      ...body,
    });
  });

  it('rejects browser-selected authority and lifecycle state', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/campaigns',
      payload: {
        ...validCampaignBody(),
        actorPlayerId: '18300000-0000-4000-8000-000000000099',
        status: 'published',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(service.createCampaign).not.toHaveBeenCalled();
  });

  it('updates only a versioned draft', async () => {
    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/author/campaigns/${CAMPAIGN_ID}`,
      payload: { ...validCampaignBody(), expectedVersion: 0 },
    });
    expect(response.statusCode).toBe(200);
    expect(service.updateCampaign).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      campaignId: CAMPAIGN_ID,
      expectedVersion: 0,
      ...validCampaignBody(),
    });
  });

  it.each(['submit', 'approve', 'publish', 'retire'] as const)(
    'exposes the %s lifecycle action',
    async (action) => {
      const response = await authenticatedRequest({
        method: 'POST',
        url: `/api/v1/author/campaigns/${CAMPAIGN_ID}/${action}`,
        payload: { expectedVersion: 0, note: 'Reviewed for schedule.' },
      });
      expect(response.statusCode).toBe(200);
      const method = {
        submit: service.submitCampaign,
        approve: service.approveCampaign,
        publish: service.publishCampaign,
        retire: service.retireCampaign,
      }[action];
      expect(method).toHaveBeenCalledWith({
        actorPlayerId: AUTHOR_ID,
        campaignId: CAMPAIGN_ID,
        expectedVersion: 0,
        note: 'Reviewed for schedule.',
      });
    },
  );

  it('requires a reason when returning a campaign', async () => {
    const invalid = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/campaigns/${CAMPAIGN_ID}/return`,
      payload: { expectedVersion: 1 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(service.returnCampaign).not.toHaveBeenCalled();

    const valid = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/campaigns/${CAMPAIGN_ID}/return`,
      payload: { expectedVersion: 1, reason: 'Adjust the event window.' },
    });
    expect(valid.statusCode).toBe(200);
    expect(service.returnCampaign).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      campaignId: CAMPAIGN_ID,
      expectedVersion: 1,
      note: 'Adjust the event window.',
    });
  });

  it('maps schedule readiness failures to a safe 422 response', async () => {
    vi.mocked(service.approveCampaign).mockRejectedValueOnce(
      new AuthorContentNotReadyError(
        'A campaign event already belongs to an overlapping campaign.',
      ),
    );
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/campaigns/${CAMPAIGN_ID}/approve`,
      payload: { expectedVersion: 1 },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'CONTENT_NOT_READY' });
  });

  it('documents every campaign operation as Author bearer endpoints', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const paths = response.json<{ paths: Record<string, unknown> }>().paths;
    expect(paths).toHaveProperty('/api/v1/author/campaigns');
    expect(paths).toHaveProperty('/api/v1/author/campaigns/{campaignId}');
    for (const action of ['submit', 'approve', 'return', 'publish', 'retire']) {
      expect(paths).toHaveProperty(
        `/api/v1/author/campaigns/{campaignId}/${action}`,
      );
    }
  });
});

function validCampaignBody() {
  return {
    title: 'September Open Day',
    description: 'Campus discovery during Open Day.',
    startsAt: '2026-09-05T08:00:00.000Z',
    endsAt: '2026-09-05T16:00:00.000Z',
    eventIds: [EVENT_ID],
    trailIds: [TRAIL_ID],
  };
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  payload?: Record<string, unknown>;
}) {
  return app.inject({
    method: options.method,
    url: options.url,
    headers: { authorization: 'Bearer test-access-token' },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });
}
