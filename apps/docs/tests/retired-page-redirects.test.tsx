import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ApiOverviewRedirect from '../src/pages/docs/architecture/api-overview';
import MapboxIntegrationRedirect from '../src/pages/docs/architecture/mapbox-standard-migration';
import ThirdPartyToolsRedirect from '../src/pages/docs/architecture/third-party-software-and-services';
import DatabaseRecoveryRedirect from '../src/pages/docs/database/postgis-recovery-rehearsal';
import MapboxOperationsRedirect from '../src/pages/docs/deployment/mapbox-operations';

describe('retired documentation pages', () => {
  it.each([
    {
      Page: ApiOverviewRedirect,
      destination: '/docs/api-reference',
      title: 'API reference',
      label: 'API reference',
    },
    {
      Page: MapboxIntegrationRedirect,
      destination: '/docs/architecture/external-integrations#mapbox',
      title: 'Mapbox integration',
      label: 'Integrations',
    },
    {
      Page: ThirdPartyToolsRedirect,
      destination: '/docs/architecture/technology-stack#application-stack',
      title: 'Technology stack',
      label: 'Stack',
    },
    {
      Page: DatabaseRecoveryRedirect,
      destination: '/docs/database/database-release-procedure#recovery',
      title: 'Database recovery',
      label: 'Database releases and recovery',
    },
    {
      Page: MapboxOperationsRedirect,
      destination:
        '/docs/architecture/external-integrations#mapbox-configuration',
      title: 'Mapbox configuration',
      label: 'Integrations',
    },
  ])(
    'redirects $title with a matching static fallback',
    ({ Page, destination, title, label }) => {
      const markup = renderToStaticMarkup(<Page />);

      expect(markup).toContain(`<title>${title} | Wits World</title>`);
      expect(markup).toContain('name="robots" content="noindex"');
      expect(markup).toContain(
        `http-equiv="refresh" content="0;url=${destination}"`,
      );
      expect(markup).toContain(`data-redirect-to="${destination}"`);
      expect(markup).toContain(`<a href="${destination}">${label}</a>`);
    },
  );
});
