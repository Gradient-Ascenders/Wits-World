import 'fake-indexeddb/auto';
import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';
const playerId = '6fe7dc26-cdea-4275-a2df-861724137cbc';
const deletionId = '00000000-0000-4000-8000-000000000600';
const developerKeyId = '00000000-0000-4000-8000-000000000700';
const developerApiKey = `ww_api_0123456789abcdef_${'a'.repeat(43)}`;
interface TestDeveloperKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked';
}
const developerKeyMetadata: TestDeveloperKey = {
  id: developerKeyId,
  name: 'Lecturer demo',
  keyPrefix: 'ww_api_0123456789abcdef_…',
  createdAt: '2026-09-23T18:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  status: 'active',
};

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('player account page', () => {
  it('shows authoritative profile data and opens Auth0-hosted recovery for a database user', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    mockAccountApi({ connectionStrategy: 'auth0' });

    renderAccount('/account', { loginWithRedirect });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Account settings',
      }),
    ).toBeVisible();
    expect(screen.getByText('test-player', { selector: 'dd' })).toBeVisible();
    expect(
      screen.getByText('Your account information is read-only here.'),
    ).toBeVisible();
    expect(screen.getByText('Auth0')).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /password/iu }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/account?action=password-recovery' },
      authorizationParams: { prompt: 'login' },
    });
  });

  it('reports the Auth0 recovery handoff without claiming the password changed', async () => {
    mockAccountApi({ connectionStrategy: 'auth0' });

    renderAccount('/account?action=password-recovery');

    expect(
      await screen.findByText(/Completion stays with Auth0/iu),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/account');
    expect(window.location.search).toBe('');
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('keeps Auth0 recovery retryable when the hosted flow cannot open', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce(undefined);
    mockAccountApi({ connectionStrategy: 'auth0' });

    renderAccount('/account', { loginWithRedirect });

    await user.click(
      await screen.findByRole('button', {
        name: 'Reset password',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Auth0 password recovery could not open',
    );

    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(loginWithRedirect).toHaveBeenCalledTimes(2);
  });

  it('keeps federated credentials with Google and does not offer Auth0 database recovery', async () => {
    mockAccountApi({ connectionStrategy: 'google-oauth2', playerName: null });

    renderAccount('/account');

    expect(
      await screen.findByText(/password is managed by Google/iu),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Reset password' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Not chosen yet')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Open Google recovery/iu }),
    ).toHaveAttribute(
      'href',
      'https://support.google.com/accounts/answer/7682439',
    );
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('generates a named developer API key and shows the complete secret once', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi({ connectionStrategy: 'auth0' });

    renderAccount('/account');

    expect(
      await screen.findByRole('heading', { name: 'Developer API access' }),
    ).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: 'Key name' }),
      'Lecturer demo',
    );
    await user.click(screen.getByRole('button', { name: 'Generate API key' }));

    expect(
      await screen.findByRole('heading', { name: 'Save this API key now' }),
    ).toHaveFocus();
    expect(
      screen.getByRole('textbox', { name: 'Generated API key' }),
    ).toHaveValue(developerApiKey);
    expect(
      screen.getByText(/cannot show the complete value again/iu),
    ).toBeVisible();

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/developer/keys') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toEqual({
      name: 'Lecturer demo',
    });
    expect(window.localStorage.getItem('developerApiKey')).toBeNull();
    expect(window.sessionStorage.getItem('developerApiKey')).toBeNull();

    expect(screen.getByLabelText('Key name')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'I have saved it' }));
    expect(screen.getByLabelText('Key name')).toBeEnabled();
  });

  it('requires explicit confirmation before revoking a developer API key', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi({
      connectionStrategy: 'auth0',
      developerKeys: [developerKeyMetadata],
    });

    renderAccount('/account');

    expect(await screen.findByText('Lecturer demo')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(
      screen.getByText(/Applications using it will stop working immediately/iu),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Revoke key' }));

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(`/developer/keys/${developerKeyId}`) &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(await screen.findByText('Revoked')).toBeVisible();
  });

  it('returns keyboard focus to the revoke trigger when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    mockAccountApi({
      connectionStrategy: 'auth0',
      developerKeys: [developerKeyMetadata],
    });

    renderAccount('/account');

    const revoke = await screen.findByRole('button', { name: 'Revoke' });
    await user.click(revoke);
    expect(revoke).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revoke).toHaveFocus();
    expect(revoke).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables generation when five developer API keys are active', async () => {
    mockAccountApi({
      connectionStrategy: 'auth0',
      developerKeys: Array.from({ length: 5 }, (_, index) => ({
        ...developerKeyMetadata,
        id: `00000000-0000-4000-8000-00000000070${index}`,
        name: `Application ${index + 1}`,
      })),
    });

    renderAccount('/account');

    expect(await screen.findByText('5 of 5 active')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Generate API key' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/revoke a key before generating another/iu),
    ).toBeVisible();
  });

  it('requires a fresh Auth0 login before presenting the destructive confirmation', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    mockAccountApi({ connectionStrategy: 'auth0' });

    renderAccount('/account', { loginWithRedirect });

    const trigger = await screen.findByRole('button', {
      name: 'Delete account',
    });
    await user.click(trigger);

    expect(
      screen.getByRole('heading', { name: 'Delete account?' }),
    ).toBeVisible();
    expect(
      screen.getByText(/you’ll need to sign in again with Auth0/iu),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    ).toHaveFocus();
    expect(
      document.querySelector('.site-frame')?.closest('body > div'),
    ).toHaveProperty('inert', true);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('heading', { name: 'Delete account?' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(
      document.querySelector('.site-frame')?.closest('body > div'),
    ).toHaveProperty('inert', false);

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/account?action=confirm-deletion' },
      authorizationParams: { max_age: 0, prompt: 'login' },
    });
  });

  it.each([
    {
      heading: 'Your Wits World account is deleted',
      responseStatus: 200,
      status: 'completed' as const,
    },
    {
      heading: 'Your account is locked while cleanup retries',
      responseStatus: 202,
      status: 'retry_pending' as const,
    },
  ])(
    'renders the $status deletion response without handling passwords',
    async ({ heading, responseStatus, status }) => {
      const user = userEvent.setup();
      const fetchMock = mockAccountApi({
        connectionStrategy: 'auth0',
        deletionResponses: [
          {
            body: { deletionId, requestId: 'delete-request', status },
            status: responseStatus,
          },
        ],
      });

      renderAccount('/account?action=confirm-deletion', {
        getIdTokenClaims: vi.fn().mockResolvedValue({
          __raw: 'fresh-id-token-kept-only-in-memory',
        }),
      });

      expect(
        await screen.findByRole('heading', {
          name: 'Permanently delete account?',
        }),
      ).toBeVisible();
      const confirm = screen.getByRole('button', {
        name: 'Permanently delete account',
      });
      expect(confirm).toBeDisabled();

      await user.click(
        screen.getByRole('checkbox', {
          name: /I understand this cannot be undone/iu,
        }),
      );
      await user.click(confirm);

      const resultHeading = await screen.findByRole('heading', {
        name: heading,
      });
      await vi.waitFor(() => expect(resultHeading).toHaveFocus());
      expect(
        screen.getByText(`Deletion reference: ${deletionId}`),
      ).toBeVisible();
      expect(document.querySelector('input[type="password"]')).toBeNull();

      const deletionCall = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith('/auth/account-deletion'),
      );
      const requestBody = JSON.parse(
        String((deletionCall?.[1] as RequestInit | undefined)?.body),
      ) as Record<string, unknown>;
      expect(requestBody).toEqual({
        confirmation: 'DELETE_MY_ACCOUNT',
        reauthenticationToken: 'fresh-id-token-kept-only-in-memory',
      });
      expect(requestBody).not.toHaveProperty('password');
    },
  );

  it.each([false, true])(
    'honours continue=%s after warning about failed cleanup during account deletion',
    async (proceed) => {
      const user = userEvent.setup();
      const fetchMock = mockAccountApi({
        connectionStrategy: 'auth0',
        deletionResponses: [
          {
            body: {
              deletionId,
              status: 'completed',
              requestId: 'delete-request',
            },
            status: 200,
          },
        ],
      });
      const warning = vi.spyOn(window, 'confirm').mockReturnValue(proceed);
      renderAccount('/account?action=confirm-deletion', {
        getIdTokenClaims: vi
          .fn()
          .mockResolvedValue({ __raw: 'fresh-id-token' }),
      });
      await screen.findByRole('heading', {
        name: 'Permanently delete account?',
      });
      await user.click(
        screen.getByRole('checkbox', {
          name: /I understand this cannot be undone/iu,
        }),
      );
      vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
        throw new DOMException('Storage unavailable', 'InvalidStateError');
      });
      await user.click(
        screen.getByRole('button', { name: 'Permanently delete account' }),
      );
      await vi.waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          expect.stringContaining('Continue to delete your account anyway?'),
        ),
      );
      if (proceed)
        await screen.findByRole('heading', {
          name: 'Your Wits World account is deleted',
        });
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith('/auth/account-deletion'),
        ),
      ).toBe(proceed);
      if (!proceed)
        expect(
          await screen.findByRole('button', {
            name: 'Permanently delete account',
          }),
        ).toBeEnabled();
    },
  );

  it('recovers from expired recent-authentication proof without locking the UI', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    mockAccountApi({
      connectionStrategy: 'auth0',
      deletionResponses: [
        {
          body: {
            code: 'RECENT_AUTHENTICATION_REQUIRED',
            detail: 'safe detail',
            requestId: 'expired-request',
            status: 401,
            title: 'Recent authentication required',
            type: 'https://wits.world/problems/recent-authentication-required',
          },
          status: 401,
        },
      ],
    });

    renderAccount('/account?action=confirm-deletion', {
      getIdTokenClaims: vi
        .fn()
        .mockResolvedValue({ __raw: 'expired-id-token' }),
      loginWithRedirect,
    });

    await confirmPermanentDeletion(user);

    const errorHeading = await screen.findByRole('heading', {
      name: 'Your identity check expired',
    });
    await waitFor(() => expect(errorHeading).toHaveFocus());
    expect(
      screen.getByText('Support reference: expired-request'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Verify again with Auth0' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/account?action=confirm-deletion' },
      authorizationParams: { max_age: 0, prompt: 'login' },
    });
  });

  it('offers an idempotent retry after an ambiguous API failure', async () => {
    const user = userEvent.setup();
    mockAccountApi({
      connectionStrategy: 'auth0',
      deletionResponses: [
        {
          body: {
            code: 'INTERNAL_ERROR',
            requestId: 'failed-request',
          },
          status: 500,
        },
        {
          body: {
            deletionId,
            requestId: 'retry-request',
            status: 'completed',
          },
          status: 200,
        },
      ],
    });

    renderAccount('/account?action=confirm-deletion', {
      getIdTokenClaims: vi.fn().mockResolvedValue({ __raw: 'fresh-id-token' }),
    });

    await confirmPermanentDeletion(user);
    expect(
      await screen.findByRole('heading', {
        name: 'The deletion response could not be confirmed',
      }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Try deletion again' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Your Wits World account is deleted',
      }),
    ).toBeVisible();
  });
});

async function confirmPermanentDeletion(
  user: ReturnType<typeof userEvent.setup>,
) {
  await screen.findByRole('heading', {
    name: 'Permanently delete account?',
  });
  await user.click(
    screen.getByRole('checkbox', {
      name: /I understand this cannot be undone/iu,
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Permanently delete account' }),
  );
}

function renderAccount(
  path: string,
  overrides: Partial<Auth0ContextInterface> = {},
) {
  window.history.replaceState({}, '', path);

  const authValue = {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    getIdTokenClaims: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    user: { sub: 'auth0|player-123' },
    ...overrides,
  } as Auth0ContextInterface;

  return render(
    <Auth0Context.Provider value={authValue}>
      <Router>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
          mapboxAccessToken={mapboxAccessToken}
        />
      </Router>
    </Auth0Context.Provider>,
  );
}

function mockAccountApi({
  connectionStrategy,
  deletionResponses = [],
  developerKeys = [],
  playerName = 'test-player',
}: {
  connectionStrategy: 'auth0' | 'google-oauth2';
  deletionResponses?: Array<{ body: object; status: number }>;
  developerKeys?: TestDeveloperKey[];
  playerName?: string | null;
}) {
  let deletionIndex = 0;
  let currentDeveloperKeys = [...developerKeys];

  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            connectionStrategy,
            id: playerId,
            lifecycleStatus: 'active',
            playerName,
            playerNameSetupRequired: playerName === null,
            requestId: 'account-profile-request',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/developer/keys') && method === 'GET') {
        return new Response(
          JSON.stringify({
            activeKeyLimit: 5,
            keys: currentDeveloperKeys,
            requestId: 'developer-list-request',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/developer/keys') && method === 'POST') {
        currentDeveloperKeys = [developerKeyMetadata, ...currentDeveloperKeys];
        return new Response(
          JSON.stringify({
            apiKey: developerApiKey,
            key: developerKeyMetadata,
            requestId: 'developer-create-request',
          }),
          { status: 201 },
        );
      }

      if (
        url.endsWith(`/developer/keys/${developerKeyId}`) &&
        method === 'DELETE'
      ) {
        const revoked = {
          ...developerKeyMetadata,
          revokedAt: '2026-09-23T19:00:00.000Z',
          status: 'revoked' as const,
        };
        currentDeveloperKeys = currentDeveloperKeys.map((key) =>
          key.id === developerKeyId ? revoked : key,
        );
        return new Response(
          JSON.stringify({
            key: revoked,
            requestId: 'developer-revoke-request',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/auth/account-deletion')) {
        const response = deletionResponses[deletionIndex];
        deletionIndex += 1;

        return new Response(JSON.stringify(response?.body ?? {}), {
          status: response?.status ?? 500,
        });
      }

      return new Response(null, { status: 404 });
    });
}
