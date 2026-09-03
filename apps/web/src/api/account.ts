import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export const permanentDeletionConfirmation = 'DELETE_MY_ACCOUNT';

export type AccountDeletionStatus = 'completed' | 'retry_pending';

export interface AccountDeletionResult {
  deletionId: string;
  requestId: string;
  status: AccountDeletionStatus;
}

export type AccountApiFailure =
  | 'account-unavailable'
  | 'authorization'
  | 'recent-authentication'
  | 'unavailable';

export class AccountApiError extends Error {
  public constructor(
    public readonly failure: AccountApiFailure,
    public readonly options: {
      code?: string;
      requestId?: string;
    } = {},
  ) {
    super('The account request could not be completed.');
    this.name = 'AccountApiError';
  }
}

interface DeleteCurrentAccountOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  reauthenticationToken: string;
  signal: AbortSignal;
}

export async function deleteCurrentAccount({
  apiBaseUrl,
  getAccessToken,
  reauthenticationToken,
  signal,
}: DeleteCurrentAccountOptions): Promise<AccountDeletionResult> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new AccountApiError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/account-deletion`, {
      body: JSON.stringify({
        confirmation: permanentDeletionConfirmation,
        reauthenticationToken,
      }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new AccountApiError('unavailable');
  }

  if (!response.ok) {
    const problem = await readProblem(response);
    const options = {
      ...(typeof problem?.code === 'string' ? { code: problem.code } : {}),
      ...(typeof problem?.requestId === 'string'
        ? { requestId: problem.requestId }
        : {}),
    };

    if (
      response.status === 401 &&
      problem?.code === 'RECENT_AUTHENTICATION_REQUIRED'
    ) {
      throw new AccountApiError('recent-authentication', options);
    }

    if (response.status === 401) {
      throw new AccountApiError('authorization', options);
    }

    if (response.status === 403 && problem?.code === 'ACCOUNT_UNAVAILABLE') {
      throw new AccountApiError('account-unavailable', options);
    }

    throw new AccountApiError('unavailable', options);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['deletionId', 'requestId', 'status']) ||
    !isUuid(payload.deletionId) ||
    typeof payload.requestId !== 'string' ||
    (payload.status !== 'completed' && payload.status !== 'retry_pending')
  ) {
    throw new AccountApiError('unavailable');
  }

  return {
    deletionId: payload.deletionId,
    requestId: payload.requestId,
    status: payload.status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(value)
  );
}

async function readProblem(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}
