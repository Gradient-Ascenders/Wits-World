import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Home from '../src/pages/index';

describe('documentation homepage', () => {
  it('renders the product introduction and every reader path', () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain('<h1');
    expect(markup).toContain('Wits World');
    expect(markup).toContain('Wits Quest');
    expect(markup).toContain('Choose a path');
    expect(markup).toContain('All documentation');
    expect(markup).toContain('href="/docs/sprint-2-overview"');
    expect(markup).toContain('aria-label="Documentation sections"');

    for (const label of [
      'Start here',
      'Game rules &amp; player experience',
      'Technical guides',
      'Development &amp; deployment',
      'Testing &amp; feedback',
      'Project &amp; sprint records',
    ]) {
      expect(markup).toContain(label);
    }
  });
});
