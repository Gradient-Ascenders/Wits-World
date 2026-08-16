import { spawn } from 'node:child_process';
import console from 'node:console';
import { access, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCliPath = process.env.npm_execpath;

if (!npmCliPath) {
  throw new Error(
    'npm_execpath is required to prepare API workspace dependencies',
  );
}

const sharedDependencies = [
  {
    workspace: '@wits-world/game-rules',
    outputDirectory: 'packages/game-rules/dist',
    runtimeEntry: 'packages/game-rules/dist/src/index.js',
  },
];

function runNpm(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [npmCliPath, ...args], {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (signal) {
        rejectPromise(
          new Error(`npm was terminated by ${signal} while preparing the API`),
        );
        return;
      }

      if (code !== 0) {
        rejectPromise(
          new Error(`npm exited with code ${code} while preparing the API`),
        );
        return;
      }

      resolvePromise();
    });
  });
}

for (const dependency of sharedDependencies) {
  const outputDirectory = resolve(repositoryRoot, dependency.outputDirectory);

  await rm(outputDirectory, { recursive: true, force: true });
  console.log(
    `Building ${dependency.workspace} from a clean generated-output state...`,
  );
  await runNpm(['run', 'build', '--workspace', dependency.workspace]);
  await access(resolve(repositoryRoot, dependency.runtimeEntry));
  await import(dependency.workspace);
}
