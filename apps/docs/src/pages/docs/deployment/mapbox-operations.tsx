import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { Redirect } from '@docusaurus/router';

const destination =
  '/docs/architecture/external-integrations#mapbox-configuration';

export default function MapboxOperationsRedirect() {
  return (
    <>
      <Head>
        <title>Mapbox configuration | Wits World</title>
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <meta name="robots" content="noindex" />
      </Head>
      <Redirect to={destination} />
      <p>
        Mapbox configuration is now part of{' '}
        <Link to={destination}>Integrations</Link>.
      </p>
    </>
  );
}
