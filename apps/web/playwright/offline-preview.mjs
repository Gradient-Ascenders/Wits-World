import { build, preview } from 'vite';
import process from 'node:process';

// Keep the build/preview in one process so Windows test cleanup does not leave
// nested npm preview processes holding the port open.
await build({ mode: 'basic-e2e', build: { outDir: 'dist-e2e' } });
const server = await preview({
  build: { outDir: 'dist-e2e' },
  preview: { host: '127.0.0.1', port: 4180, strictPort: true },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.httpServer.close(() => process.exit(0)));
}
