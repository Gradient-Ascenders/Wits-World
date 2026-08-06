export const apiWorkspace = {
  name: 'Wits World API',
  status: 'database-ready',
} as const;

export { buildDatabaseConfig, loadApiEnvironment } from './config/database.js';
export { checkDatabaseReadiness } from './database/readiness.js';
export { runMigrations } from './database/migrations.js';
