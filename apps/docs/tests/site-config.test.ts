import { describe, expect, it } from 'vitest';

import config from '../docusaurus.config';

describe('documentation site configuration', () => {
  it('keeps production routing, navigation, and broken-link checks enabled', () => {
    expect(config.url).toBe('https://wits-world-docs.pages.dev');
    expect(config.baseUrl).toBe('/');
    expect(config.onBrokenLinks).toBe('throw');
    expect(config.presets).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'classic',
          expect.objectContaining({
            docs: expect.objectContaining({
              path: '../../docs',
              routeBasePath: 'docs',
            }),
          }),
        ]),
      ]),
    );
    expect(config.themeConfig).toEqual(
      expect.objectContaining({
        navbar: expect.objectContaining({ title: 'Wits World' }),
        footer: expect.objectContaining({ style: 'dark' }),
      }),
    );
  });
});
