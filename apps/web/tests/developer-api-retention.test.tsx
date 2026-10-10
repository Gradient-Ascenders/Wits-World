import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeveloperApiAccess } from '../src/components/account/DeveloperApiAccess';
import {
  createDeveloperApiKey,
  listDeveloperApiKeys,
  DeveloperApiError,
} from '../src/api/developer';
import { READ_TIMEOUT_MS } from '../src/components/loading-policy';

vi.mock('../src/api/developer', async (original) => ({
  ...(await original<typeof import('../src/api/developer')>()),
  listDeveloperApiKeys: vi.fn(),
  createDeveloperApiKey: vi.fn(),
  revokeDeveloperApiKey: vi.fn(),
}));
const keys = {
  activeKeyLimit: 5,
  keys: [
    {
      id: 'key-1',
      name: 'Confirmed key',
      keyPrefix: 'prefix',
      createdAt: '2026-10-07',
      lastUsedAt: null,
      revokedAt: null,
      status: 'active' as const,
    },
  ],
};
const getAccessToken = async () => 'fixture';
beforeEach(() => {
  vi.mocked(listDeveloperApiKeys).mockResolvedValue(keys);
  vi.mocked(createDeveloperApiKey).mockResolvedValue({
    key: keys.keys[0]!,
    apiKey: 'fixture-secret',
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
async function open() {
  render(
    <DeveloperApiAccess apiBaseUrl="fixture" getAccessToken={getAccessToken} />,
  );
  await screen.findByText('1 of 5 active');
  fireEvent.click(screen.getByRole('button', { name: 'Developer API access' }));
}
it('preserves confirmed keys and the one-time secret when post-create refresh fails', async () => {
  await open();
  vi.mocked(listDeveloperApiKeys).mockRejectedValueOnce(
    new DeveloperApiError('unavailable'),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), {
    target: { value: 'New integration' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate API key' }));
  await screen.findByText(/Could not update your API keys/);
  expect(screen.getByText('Confirmed key')).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: 'Generated API key' }),
  ).toHaveValue('fixture-secret');
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Save this API key now' }),
    ).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
  await waitFor(() =>
    expect(screen.queryByText(/Could not update/)).toBeNull(),
  );
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
});
it('clears protected metadata and secret when revalidation loses authorization', async () => {
  await open();
  vi.mocked(listDeveloperApiKeys).mockRejectedValueOnce(
    new DeveloperApiError('authorization'),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), {
    target: { value: 'New integration' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate API key' }));
  await screen.findByText('Sign in again to manage API keys.');
  expect(screen.queryByText('Confirmed key')).toBeNull();
  expect(
    screen.queryByRole('textbox', { name: 'Generated API key' }),
  ).toBeNull();
});
it('bounds pending reads and ignores completion after timeout', async () => {
  vi.useFakeTimers();
  let finish!: (value: typeof keys) => void;
  vi.mocked(listDeveloperApiKeys).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <DeveloperApiAccess apiBaseUrl="fixture" getAccessToken={getAccessToken} />,
  );
  await act(() => vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS));
  expect(
    screen.getByText('API keys are unavailable. Try again.'),
  ).toBeVisible();
  await act(async () => {
    finish(keys);
  });
  expect(screen.queryByText('1 of 5 active')).toBeNull();
});

it('releases a stalled post-create refresh so retry can reconcile without losing the secret', async () => {
  await open();
  vi.useFakeTimers();
  vi.mocked(listDeveloperApiKeys).mockImplementationOnce(
    () => new Promise(() => {}),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), {
    target: { value: 'Integration' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Generate API key' }));
  });
  await act(() => vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS));
  expect(
    screen.getByRole('textbox', { name: 'Generated API key' }),
  ).toHaveValue('fixture-secret');
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
  });
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
});
