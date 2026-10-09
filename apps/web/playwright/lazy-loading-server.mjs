import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createStaticServer } from '../server.mjs';

const server = createStaticServer({
  rootDirectory:
    process.env.LAZY_BUNDLE_DIRECTORY ??
    fileURLToPath(new URL('../dist/', import.meta.url)),
});
server.listen(5186, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
