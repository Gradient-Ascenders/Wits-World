import { describe, expect, it } from 'vitest';

import { docsWorkspace } from '../src/index.js';

describe('documentation workspace scaffold', () => {
  it('identifies the documentation application workspace', () => {
    expect(docsWorkspace).toEqual({
      name: 'Wits World documentation',
      status: 'scaffolded',
    });
  });
});
