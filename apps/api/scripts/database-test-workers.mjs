const defaultDatabaseTestWorkers = 2;

export function resolveDatabaseTestWorkers(value) {
  const configuredValue = value?.trim();

  if (!configuredValue) {
    return defaultDatabaseTestWorkers;
  }

  if (!/^[1-9]\d*$/u.test(configuredValue)) {
    throw new Error('DATABASE_TEST_WORKERS must be a positive integer.');
  }

  const workers = Number(configuredValue);

  if (!Number.isSafeInteger(workers)) {
    throw new Error('DATABASE_TEST_WORKERS must be a safe positive integer.');
  }

  return workers;
}
