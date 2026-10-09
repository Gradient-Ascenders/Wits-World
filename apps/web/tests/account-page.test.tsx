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
const authConfig = {
  audience: 'https://account.example.test/api',
  clientId: 'public-test-client',
  domain: 'account.example.test',
};
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
  it('shows authoritative profile data and navigates to the dedicated password-reset page', async () => {
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
      screen.getByRole('heading', { name: 'Account details' }),
    ).toBeVisible();
    expect(screen.getByText('Auth0')).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /password/iu }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Reset password' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reset password' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/account/reset-password');
    expect(loginWithRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: 'Account email' }),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Account settings' }));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Account settings',
      }),
    ).toBeVisible();
  });

  it.each([200, 404])(
    'confirms the reset request without claiming delivery or a password change for status %s',
    async (status) => {
      const user = userEvent.setup();
      const fetchMock = mockAccountApi({
        connectionStrategy: 'auth0',
        passwordResetResponses: [{ status }],
      });
      renderAccount('/account/reset-password', {
        user: { sub: 'auth0|player-123', email: 'player@example.test' },
      });

      const email = await screen.findByRole('textbox', {
        name: 'Account email',
      });
      expect(email).toHaveValue('player@example.test');
      await user.click(screen.getByRole('button', { name: 'Send reset link' }));
      expect(
        await screen.findByRole('heading', { name: 'Check your inbox' }),
      ).toHaveFocus();
      expect(
        screen.getByText(
          'If an account uses this email, you will receive a password-reset link.',
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          /Your password stays the same until you follow the link/,
        ),
      ).toBeVisible();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://account.example.test/dbconnections/change_password',
        expect.objectContaining({
          body: JSON.stringify({
            client_id: 'public-test-client',
            connection: 'Username-Password-Authentication',
            email: 'player@example.test',
          }),
          method: 'POST',
          credentials: 'omit',
        }),
      );
      expect(document.querySelector('input[type="password"]')).toBeNull();
      expect(window.localStorage.getItem('email')).toBeNull();
      await user.click(
        screen.getByRole('button', { name: 'Use a different email' }),
      );
      expect(
        screen.getByRole('textbox', { name: 'Account email' }),
      ).toHaveValue('player@example.test');
      await user.click(screen.getByRole('link', { name: 'Account settings' }));
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Account settings',
        }),
      ).toBeVisible();
    },
  );

  it('keeps the reset request retryable after a provider error', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi({
      connectionStrategy: 'auth0',
      passwordResetResponses: [{ status: 500 }, { status: 200 }],
    });
    renderAccount('/account/reset-password');

    await user.type(
      await screen.findByRole('textbox', { name: 'Account email' }),
      'player@example.test',
    );
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not request a reset link',
    );

    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByRole('heading', { name: 'Check your inbox' }),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/dbconnections/change_password'),
      ),
    ).toHaveLength(2);
  });

  it('explains a rate-limited password-reset request', async () => {
    const user = userEvent.setup();
    mockAccountApi({
      connectionStrategy: 'auth0',
      passwordResetResponses: [{ status: 429 }],
    });
    renderAccount('/account/reset-password');
    await user.type(
      await screen.findByRole('textbox', { name: 'Account email' }),
      'player@example.test',
    );
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests',
    );
    expect(
      screen.getByRole('button', { name: 'Send reset link' }),
    ).toBeEnabled();
  });

  it('requires a valid email before requesting a password reset', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi({ connectionStrategy: 'auth0' });
    renderAccount('/account/reset-password');
    const email = await screen.findByRole('textbox', { name: 'Account email' });
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(email).toBeInvalid();
    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(email).toBeInvalid();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/dbconnections/change_password'),
      ),
    ).toBe(false);
  });

  it('does not offer an Auth0 reset form when a Google user visits its route', async () => {
    mockAccountApi({ connectionStrategy: 'google-oauth2' });
    renderAccount('/account/reset-password');
    expect(
      await screen.findByText(/Google manages your password/),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Google recovery' }),
    ).toHaveAttribute('target', '_blank');
    expect(
      screen.queryByRole('textbox', { name: 'Account email' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send reset link' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the dedicated reset route protected for signed-out visitors', async () => {
    const fetchMock = mockAccountApi({ connectionStrategy: 'auth0' });
    renderAccount('/account/reset-password', {
      isAuthenticated: false,
      user: undefined,
    });
    expect(
      await screen.findByRole('button', {
        name: 'Sign in to reset your password',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Account email' }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        /\/(?:auth\/me|dbconnections\/change_password)$/.test(String(url)),
      ),
    ).toBe(false);
  });

  it('keeps federated credentials with Google and does not offer Auth0 database recovery', async () => {
    mockAccountApi({ connectionStrategy: 'google-oauth2', playerName: null });

    renderAccount('/account');

    expect(
      await screen.findByText(/Google manages your password/iu),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Reset password' }),
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

  it('keeps developer controls collapsed until requested and reports the server key count', async () => {
    const user = userEvent.setup();
    mockAccountApi({ connectionStrategy: 'auth0' });
    renderAccount('/account');

    const disclosure = await screen.findByRole('button', {
      name: 'Developer API access',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('0 of 5 active')).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Key name' }),
    ).not.toBeInTheDocument();

    await user.click(disclosure);
    expect(screen.getByRole('textbox', { name: 'Key name' })).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: 'Key name' }),
      'Draft integration',
    );
    await user.click(disclosure);
    expect(
      screen.queryByRole('textbox', { name: 'Key name' }),
    ).not.toBeInTheDocument();
    await user.click(disclosure);
    expect(screen.getByRole('textbox', { name: 'Key name' })).toHaveValue(
      'Draft integration',
    );
  });

  it('keeps developer load errors and retry available while the controls are collapsed', async () => {
    const user = userEvent.setup();
    mockAccountApi({
      connectionStrategy: 'auth0',
      developerListResponses: [
        { body: { requestId: 'keys-unavailable' }, status: 503 },
      ],
    });
    renderAccount('/account');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'API keys are unavailable',
    );
    expect(
      screen.getByRole('button', { name: 'Developer API access' }),
    ).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('0 of 5 active')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps developer mutation errors visible when controls are collapsed', async () => {
    const user = userEvent.setup();
    mockAccountApi({
      connectionStrategy: 'auth0',
      developerCreateResponse: {
        body: { requestId: 'create-unavailable' },
        status: 503,
      },
    });
    renderAccount('/account');
    const disclosure = await screen.findByRole('button', {
      name: 'Developer API access',
    });
    await user.click(disclosure);
    await user.type(
      screen.getByRole('textbox', { name: 'Key name' }),
      'Integration',
    );
    await user.click(screen.getByRole('button', { name: 'Generate API key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'API keys are unavailable',
    );
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('alert')).toBeVisible();
  });

  it('generates a named developer API key and shows the complete secret once', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi({ connectionStrategy: 'auth0' });

    renderAccount('/account');

    expect(
      await screen.findByRole('heading', { name: 'Developer API access' }),
    ).toBeVisible();
    const disclosure = screen.getByRole('button', {
      name: 'Developer API access',
    });
    await user.click(disclosure);
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
    expect(screen.getByText(/This key is shown only once/iu)).toBeVisible();

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
    expect(disclosure).toHaveAttribute('aria-disabled', 'true');
    await user.click(disclosure);
    expect(
      screen.getByRole('textbox', { name: 'Generated API key' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'I have saved it' }));
    expect(screen.getByLabelText('Key name')).toBeEnabled();
    await waitFor(() =>
      expect(screen.getByLabelText('Key name')).toHaveFocus(),
    );
    expect(disclosure).not.toHaveAttribute('aria-disabled');
  });

  it('requires explicit confirmation before revoking a developer API key', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi({
      connectionStrategy: 'auth0',
      developerKeys: [developerKeyMetadata],
    });

    renderAccount('/account');

    await user.click(
      await screen.findByRole('button', { name: 'Developer API access' }),
    );
    expect(await screen.findByText('Lecturer demo')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(
      screen.getByText(/Apps using it will lose access immediately/iu),
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

    await user.click(
      await screen.findByRole('button', { name: 'Developer API access' }),
    );
    const revoke = await screen.findByRole('button', { name: 'Revoke' });
    await user.click(revoke);
    expect(revoke).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revoke).toHaveFocus();
    expect(revoke).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables generation when five developer API keys are active', async () => {
    const user = userEvent.setup();
    mockAccountApi({
      connectionStrategy: 'auth0',
      developerKeys: Array.from({ length: 5 }, (_, index) => ({
        ...developerKeyMetadata,
        id: `00000000-0000-4000-8000-00000000070${index}`,
        name: `Application ${index + 1}`,
      })),
    });

    renderAccount('/account');

    const disclosure = await screen.findByRole('button', {
      name: 'Developer API access',
    });
    expect(await screen.findByText('5 of 5 active')).toBeVisible();
    await user.click(disclosure);
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
      screen.getByText(/Nothing is deleted until you confirm the next step/iu),
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
      heading: 'Account locked. Deletion pending.',
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
      name: 'Sign in again to continue',
    });
    await waitFor(() => expect(errorHeading).toHaveFocus());
    expect(
      screen.getByText('Support reference: expired-request'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
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
        name: 'Could not confirm deletion',
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
          authConfig={authConfig}
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
  developerListResponses = [],
  developerCreateResponse,
  playerName = 'test-player',
  passwordResetResponses = [{ status: 200 }],
}: {
  connectionStrategy: 'auth0' | 'google-oauth2';
  deletionResponses?: Array<{ body: object; status: number }>;
  developerKeys?: TestDeveloperKey[];
  developerListResponses?: Array<{ body: object; status: number }>;
  developerCreateResponse?: { body: object; status: number };
  playerName?: string | null;
  passwordResetResponses?: Array<{ status: number }>;
}) {
  let deletionIndex = 0;
  let currentDeveloperKeys = [...developerKeys];
  let developerListIndex = 0;
  let passwordResetIndex = 0;

  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/dbconnections/change_password')) {
        return new Response('Provider response is not displayed.', {
          status: passwordResetResponses[passwordResetIndex++]?.status ?? 500,
        });
      }

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
        const response = developerListResponses[developerListIndex++];
        if (response)
          return new Response(JSON.stringify(response.body), {
            status: response.status,
          });
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
        if (developerCreateResponse)
          return new Response(JSON.stringify(developerCreateResponse.body), {
            status: developerCreateResponse.status,
          });
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
