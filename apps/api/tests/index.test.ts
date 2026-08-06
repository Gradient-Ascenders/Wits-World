import { describe, expect, it } from 'vitest';

import { apiWorkspace } from '../src/index.js';

describe('API workspace scaffold', () => {
  it('identifies the API application workspace', () => {
    expect(apiWorkspace).toEqual({
      name: 'Wits World API',
      status: 'database-ready',
    });
  });
});
