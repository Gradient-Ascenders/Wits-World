import type { HtmlTagDescriptor, Plugin } from 'vite';

export function sessionConnectionHints(
  environment: Record<string, unknown>,
): HtmlTagDescriptor[] {
  const hints: HtmlTagDescriptor[] = [];
  const domain = environment.VITE_AUTH0_DOMAIN;
  if (typeof domain === 'string' && domain.trim()) {
    try {
      const url = new URL(`https://${domain.trim()}`);
      if (
        url.host === domain.trim() &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      ) {
        // Silent session restoration uses a credentialed Auth0 iframe.
        hints.push({
          tag: 'link',
          attrs: { rel: 'preconnect', href: url.origin },
          injectTo: 'head',
        });
      }
    } catch {
      /* The application reports invalid configuration separately. */
    }
  }
  const api = environment.VITE_API_BASE_URL;
  if (typeof api === 'string' && api.trim()) {
    try {
      const url = new URL(api.trim());
      if (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      ) {
        // API reads use CORS bearer authentication rather than browser cookies.
        hints.push({
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: url.origin,
            crossorigin: 'anonymous',
          },
          injectTo: 'head',
        });
      }
    } catch {
      /* Hints must never prevent the application from starting. */
    }
  }
  return hints;
}

export function preconnectSessionOrigins(): Plugin {
  let tags: HtmlTagDescriptor[] = [];
  return {
    name: 'wits-world-session-connections',
    configResolved(config) {
      tags = sessionConnectionHints(config.env);
    },
    // HTML starts these connections before the application and Auth0 bundles run.
    transformIndexHtml() {
      return tags;
    },
  };
}
