import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function selectProductionGameplayMode({
  backend = 'polling',
  writersCoordinated = 'false',
} = {}) {
  if (!['polling', 'upstash'].includes(backend)) {
    throw new Error('Invalid production gameplay scheduler backend.');
  }
  if (!['false', 'true'].includes(writersCoordinated)) {
    throw new Error(
      'PRODUCTION_GAMEPLAY_WRITERS_COORDINATED must be true or false.',
    );
  }
  return backend === 'upstash' && writersCoordinated === 'true'
    ? 'upstash'
    : 'polling';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      selectProductionGameplayMode({
        backend: process.env.PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND || 'polling',
        writersCoordinated:
          process.env.PRODUCTION_GAMEPLAY_WRITERS_COORDINATED || 'false',
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
