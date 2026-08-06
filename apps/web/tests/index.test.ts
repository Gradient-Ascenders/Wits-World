import { describe, expect, it } from 'vitest';

import { webWorkspace } from '../src/index.js';

describe('web workspace scaffold', () => {
  it('identifies the web application workspace', () => {
    expect(webWorkspace).toEqual({
      name: 'Wits World web application',
      status: 'scaffolded',
    });
  });
});
