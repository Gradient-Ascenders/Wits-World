import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not implement media queries; individual responsive tests may override this.
beforeEach(() => {
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => ({
        media,
        matches: false,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  }
});
