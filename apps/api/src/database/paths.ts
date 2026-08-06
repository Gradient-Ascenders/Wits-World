import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function findRepositoryRoot(startDirectory = process.cwd()) {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (
      existsSync(resolve(currentDirectory, 'package.json')) &&
      existsSync(resolve(currentDirectory, 'database/migrations'))
    ) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      throw new Error('Could not find repository root from current directory.');
    }

    currentDirectory = parentDirectory;
  }
}

export function getMigrationsDirectory(repositoryRoot = findRepositoryRoot()) {
  return resolve(repositoryRoot, 'database/migrations');
}
