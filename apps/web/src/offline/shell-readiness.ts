/** Ask the controlling worker to verify the files needed to reopen offline. */
export async function offlineShellReady(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || typeof MessageChannel === 'undefined')
    return false;
  const worker = navigator.serviceWorker.controller;
  if (!worker) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(ready);
    };
    const timer = window.setTimeout(() => finish(false), 2_000);
    channel.port1.onmessage = (event) => finish(event.data?.ready === true);
    try {
      worker.postMessage('CHECK_OFFLINE_SHELL', [channel.port2]);
    } catch {
      finish(false);
    }
  });
}
