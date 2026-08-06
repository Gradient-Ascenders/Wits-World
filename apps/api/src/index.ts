export { buildApp, type BuildAppOptions } from './app.js';
export {
  apiLogLevels,
  buildApiConfig,
  type ApiConfig,
  type ApiLogLevel,
} from './config/api.js';

export const apiWorkspace = {
  name: 'Wits World API',
  status: 'api-foundation-ready',
} as const;

export { buildDatabaseConfig, loadApiEnvironment } from './config/database.js';
export { checkDatabaseReadiness } from './database/readiness.js';
export { runMigrations } from './database/migrations.js';
