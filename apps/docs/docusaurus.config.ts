import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

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
          to: '/docs/',
          position: 'left',
          label: 'Documentation',
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
              label: 'Overview',
              to: '/docs/',
            },
            {
              label: 'Product & Requirements',
              to: '/docs/product-requirements',
            },
            {
              label: 'Architecture',
              to: '/docs/architecture',
            },
            {
              label: 'Development & Operations',
              to: '/docs/development-operations',
            },
            {
              label: 'Testing & Quality',
              to: '/docs/testing-quality',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Project Management',
              to: '/docs/project-management',
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
