import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { Redirect } from '@docusaurus/router';

const destination = '/docs/architecture/external-integrations#mapbox';

export default function MapboxIntegrationRedirect() {
  return (
    <>
      <Head>
        <title>Mapbox integration | Wits World</title>
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <meta name="robots" content="noindex" />
      </Head>
      <Redirect to={destination} />
      <p>
        Mapbox integration is now part of{' '}
        <Link to={destination}>Integrations</Link>.
      </p>
    </>
  );
}
