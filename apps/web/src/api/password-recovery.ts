import type { AuthConfig } from '../config/environment';

export class PasswordRecoveryError extends Error {
  public constructor(public readonly failure: 'rate-limited' | 'unavailable') {
    super('The password-reset link could not be requested.');
    this.name = 'PasswordRecoveryError';
  }
}

export async function requestPasswordReset({
  authConfig,
  email,
  signal,
}: {
  authConfig: AuthConfig;
  email: string;
  signal: AbortSignal;
}): Promise<void> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 15_000);

  try {
    const response = await fetch(
      `https://${authConfig.domain}/dbconnections/change_password`,
      {
        body: JSON.stringify({
          client_id: authConfig.clientId,
          connection:
            authConfig.databaseConnection ?? 'Username-Password-Authentication',
          email: email.trim(),
        }),
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      },
    );

    if (response.status === 429) {
      throw new PasswordRecoveryError('rate-limited');
    }

    // Keep the same confirmation for unknown addresses and accepted requests.
    if (!response.ok && response.status !== 404) {
      throw new PasswordRecoveryError('unavailable');
    }
  } catch (error) {
    if (signal.aborted || error instanceof PasswordRecoveryError) {
      throw error;
    }
    throw new PasswordRecoveryError('unavailable');
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
