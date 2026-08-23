import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDirectory = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);
const repositoryRoot = path.resolve(webDirectory, '../..');

export default async function basicGlobalSetup() {
  const compilation = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--project',
      path.join(repositoryRoot, 'apps/api/tsconfig.e2e.json'),
    ],
    { cwd: repositoryRoot, env: process.env, stdio: 'inherit' },
  );
  if (compilation.status !== 0) {
    throw new Error('The Basic E2E API harness did not compile.');
  }

  const api = startNode(
    path.join(repositoryRoot, 'apps/api/dist-e2e/e2e/basic-server.js'),
  );
  let web: ChildProcess | undefined;

  try {
    await waitForUrl('http://127.0.0.1:3002/health', api, 120_000);
    web = startNode(
      path.join(repositoryRoot, 'node_modules/vite/bin/vite.js'),
      ['--mode', 'basic-e2e', '--host', '127.0.0.1', '--port', '5175'],
      {
        VITE_API_BASE_URL: 'http://127.0.0.1:3002/api/v1',
        VITE_AUTH0_AUDIENCE: 'https://basic-e2e.invalid/api',
        VITE_AUTH0_CLIENT_ID: 'basic-e2e-client',
        VITE_AUTH0_DOMAIN: 'basic-e2e.invalid',
        VITE_DEV_GEO_ACCURACY: '',
        VITE_DEV_GEO_LAT: '',
        VITE_DEV_GEO_LNG: '',
        VITE_MAPBOX_ACCESS_TOKEN: 'pk.basic-e2e-not-used',
      },
      webDirectory,
    );
    await waitForUrl('http://127.0.0.1:5175', web, 120_000);
  } catch (error) {
    stopProcessTree(web);
    stopProcessTree(api);
    throw error;
  }

  process.env.BASIC_E2E_API_PROCESS_ID = String(api.pid);
  process.env.BASIC_E2E_WEB_PROCESS_ID = String(web.pid);
}

function startNode(
  entrypoint: string,
  arguments_: string[] = [],
  environment: NodeJS.ProcessEnv = {},
  cwd = repositoryRoot,
): ChildProcess {
  return spawn(process.execPath, [entrypoint, ...arguments_], {
    cwd,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
}

async function waitForUrl(
  url: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${url} process exited with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not become ready within ${timeoutMs}ms.`);
}

function stopProcessTree(child: ChildProcess | undefined): void {
  if (!child?.pid || child.exitCode !== null) return;
  child.kill('SIGTERM');
}
