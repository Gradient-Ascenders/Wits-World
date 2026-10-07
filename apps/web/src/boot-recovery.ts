// Keep this pure DOM entry independent of React and the application bundle.
// The static CSS repeats this deadline so recovery works if this module fails.
export const BOOT_LONG_WAIT_MS = 8_000;

export async function bootApplication(
  root: HTMLElement | null,
  loadApplication: () => Promise<unknown>,
): Promise<void> {
  function showRecovery(state: 'slow' | 'error') {
    const fallback = root?.querySelector<HTMLElement>('#app-boot');
    if (!fallback) return;
    fallback.dataset.state = state;
    const status = fallback.querySelector('.boot-screen__status');
    if (status) {
      status.textContent =
        state === 'error'
          ? 'Wits World could not be opened.'
          : 'Taking longer than usual.';
    }
  }

  const timer = window.setTimeout(
    () => showRecovery('slow'),
    BOOT_LONG_WAIT_MS,
  );
  try {
    await loadApplication();
  } catch {
    showRecovery('error');
  } finally {
    window.clearTimeout(timer);
  }
}
