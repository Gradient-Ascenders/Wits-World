import type { OutputBundle } from 'rolldown';
import { describe, expect, it } from 'vitest';
import { createPrecachePolicy } from '../precache-policy';

function buildPolicy(omit?: string, empty?: string, eagerSavedPlay = false) {
  const policy = createPrecachePolicy();
  const bundle = Object.fromEntries(
    [
      ['boot.js', '/project/index.html', ['common.js']],
      ['main.js', '/project/src/main.tsx', ['boot.js']],
      ['home.js', '/project/src/pages/HomePage.tsx', ['main.js']],
      ['offline.js', '/project/src/offline/OfflinePages.tsx', ['question.js']],
      ['explore.js', '/project/src/pages/ExplorePage.tsx', ['common.js']],
      ['question.js', null, ['common.js']],
      ['common.js', null, ['main.js']],
      [
        'author.js',
        '/project/src/components/author/EventWorkspace.tsx',
        ['common.js'],
      ],
      ['profile.js', '/project/src/pages/ProfilePage.tsx', ['common.js']],
      ['map.js', '/project/node_modules/mapbox-gl/index.js', ['common.js']],
    ]
      .filter(([file]) => file !== omit)
      .map(([fileName, facadeModuleId, imports]) => [
        fileName,
        {
          type: 'chunk',
          code: fileName === empty ? '' : '/* emitted JavaScript */',
          fileName,
          facadeModuleId,
          imports,
          isEntry: fileName === 'boot.js',
          dynamicImports: ['author.js', 'map.js', 'profile.js'],
        },
      ]),
  ) as unknown as OutputBundle;
  if (eagerSavedPlay) {
    const main = bundle['main.js'];
    if (main?.type !== 'chunk') throw new Error('Expected main chunk');
    main.modules = {
      '/project/src/offline/OfflinePages.tsx': {} as never,
    };
    main.imports.push('question.js');
    delete bundle['offline.js'];
  }
  const hook = policy.plugin.generateBundle;
  if (typeof hook !== 'function') throw new Error('Expected build hook');
  hook.call(
    {} as ThisParameterType<typeof hook>,
    {} as Parameters<typeof hook>[0],
    bundle,
    false,
  );
  return policy;
}

describe('offline shell dependency selection', () => {
  it('finds saved play and its dependencies when it is part of the eager shell', async () => {
    const entries = [
      'boot.js',
      'main.js',
      'home.js',
      'explore.js',
      'question.js',
      'common.js',
      'profile.js',
    ].map((url) => ({ url, revision: null }));
    const { manifest } = await buildPolicy(
      undefined,
      undefined,
      true,
    ).transform(entries);
    expect(
      manifest
        .filter((entry) => entry.precache === false)
        .map((entry) => entry.url),
    ).toEqual(['profile.js']);
  });
  it('keeps dependencies of CSS-only chunks without requiring phantom JavaScript files', async () => {
    const entries = [
      'boot.js',
      'main.js',
      'home.js',
      'offline.js',
      'explore.js',
      'common.js',
      'question.css',
    ].map((url) => ({ url, revision: null }));
    const { manifest } = await buildPolicy(undefined, 'question.js').transform(
      entries,
    );
    expect(manifest.map((entry) => entry.url)).toEqual(
      entries.map((entry) => entry.url),
    );
  });
  it('retains transitive static dependencies and cycles without importing unrelated lazy routes', async () => {
    const urls = [
      'boot.js',
      'main.js',
      'home.js',
      'offline.js',
      'explore.js',
      'question.js',
      'common.js',
      'author.js',
      'profile.js',
      'map.js',
      'home.css',
      'font.woff2',
      'campus.webp',
      'index.html',
    ];
    const { manifest } = await buildPolicy().transform(
      urls.map((url) => ({ url, revision: null })),
    );
    expect(
      manifest
        .filter((entry) => entry.precache === false)
        .map((entry) => entry.url),
    ).toEqual(['author.js', 'profile.js', 'map.js']);
    expect(
      manifest
        .filter((entry) => entry.precache !== false)
        .map((entry) => entry.url),
    ).toEqual(
      urls.filter(
        (url) => !['author.js', 'profile.js', 'map.js'].includes(url),
      ),
    );
  });

  it('fails closed when an offline root or dependency disappears', () => {
    expect(() => buildPolicy('offline.js')).toThrow(
      'Missing offline build root',
    );
    expect(() => buildPolicy('question.js')).toThrow(
      'Missing offline build dependency',
    );
  });

  it('rejects missing manifest coverage and conflicting revisions', async () => {
    await expect(buildPolicy().transform([])).rejects.toThrow(
      'outside the shell manifest',
    );
    await expect(
      buildPolicy().transform([
        { url: 'index.html', revision: 'old' },
        { url: 'index.html', revision: 'new' },
      ]),
    ).rejects.toThrow('Conflicting shell asset revisions');
    await expect(createPrecachePolicy().transform([])).rejects.toThrow(
      'graph is unavailable',
    );
  });

  it('deduplicates identical public asset entries without losing revisions', async () => {
    const entries = [
      'boot.js',
      'main.js',
      'home.js',
      'offline.js',
      'explore.js',
      'question.js',
      'common.js',
    ].map((url) => ({ url, revision: null }));
    const publicAsset = { url: 'branding/seal.svg', revision: 'revision-one' };
    const { manifest } = await buildPolicy().transform([
      ...entries,
      publicAsset,
      publicAsset,
    ]);
    expect(manifest.filter((entry) => entry.url === publicAsset.url)).toEqual([
      publicAsset,
    ]);
  });
});
