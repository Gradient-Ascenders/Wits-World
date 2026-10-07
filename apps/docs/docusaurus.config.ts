import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type { PluginOptions as SearchOptions } from '@easyops-cn/docusaurus-search-local';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Wits World',
  tagline: 'Documentation for the Wits Quest campus exploration game',
  favicon: 'img/wits-world-favicon.svg',

  future: {
    v4: true,
  },

  // Set the production url of your site here
  url: process.env.DOCS_SITE_URL ?? 'https://wits-world-docs.pages.dev',

  baseUrl: '/',

  onBrokenLinks: 'throw',

  markdown: { mermaid: true },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        docsDir: '../../docs',
        docsRouteBasePath: '/docs',
        indexBlog: false,
        // A new index filename prevents stale results after a docs deployment.
        hashed: 'filename',
        searchBarShortcut: true,
        searchBarShortcutKeymap: 'mod+k',
      } satisfies SearchOptions,
    ],
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../../docs',
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    docs: {
      sidebar: {
        autoCollapseCategories: true,
      },
    },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
      options: {
        flowchart: { useMaxWidth: false },
        sequence: { useMaxWidth: false, wrap: true },
        er: { useMaxWidth: false },
        state: { useMaxWidth: false },
      },
    },
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Wits World',
      logo: {
        alt: 'Wits World campus seal',
        src: 'img/wits-world-campus-seal.svg',
      },
      items: [
        {
          type: 'search',
          position: 'right',
        },
        {
          to: '/docs/',
          position: 'left',
          label: 'Guides',
        },
        {
          to: '/docs/api-reference',
          position: 'left',
          label: 'API Reference',
        },
        {
          to: '/docs/project',
          position: 'left',
          label: 'Project',
        },
        {
          href: 'https://witsworld.co.za/',
          label: 'Play Wits Quest',
          position: 'right',
        },
        {
          href: 'https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World',
          label: 'Gitea',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: '/docs/',
            },
            {
              label: 'Player Guide',
              to: '/docs/player-guide',
            },
            {
              label: 'Author Guide',
              to: '/docs/author-guide',
            },
            {
              label: 'Developer Guide',
              to: '/docs/developer-guide',
            },
            {
              label: 'API Reference',
              to: '/docs/api-reference',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Project evidence and history',
              to: '/docs/project',
            },
            {
              label: 'Play Wits Quest',
              href: 'https://witsworld.co.za/',
            },
            {
              label: 'Gitea repository',
              href: 'https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World',
            },
          ],
        },
      ],
      copyright: `Wits World · COMS3011A Software Design Project · ${new Date().getFullYear()}`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
