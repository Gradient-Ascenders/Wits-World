import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Home from '../src/pages/index';

describe('documentation homepage', () => {
  it('renders the product introduction and every audience guide', () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain('<h1');
    expect(markup).toContain('Wits World');
    expect(markup).toContain('Wits Quest');
    expect(markup).toContain(
      'Explore campus. Discover stories. Collect cards. Battle.',
    );
    expect(markup).toContain('Choose your guide');
    expect(markup).toContain('href="https://witsworld.co.za/"');
    expect(markup).toContain('href="/docs/project"');

    for (const label of [
      'Player Guide',
      'Author Guide',
      'Developer Guide',
      'API Reference',
    ]) {
      expect(markup).toContain(label);
    }
  });
});
