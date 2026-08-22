import process from 'node:process';

export default function basicGlobalTeardown(): void {
  stopProcessTree(process.env.BASIC_E2E_WEB_PROCESS_ID);
  stopProcessTree(process.env.BASIC_E2E_API_PROCESS_ID);
}

function stopProcessTree(processId: string | undefined): void {
  if (!processId || !/^\d+$/u.test(processId)) return;
  try {
    process.kill(Number(processId), 'SIGTERM');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') throw error;
  }
}
