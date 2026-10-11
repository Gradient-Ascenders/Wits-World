import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { Redirect } from '@docusaurus/router';

const destination = '/docs/api-reference';

export default function ApiOverviewRedirect() {
  return (
    <>
      <Head>
        <title>API reference | Wits World</title>
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <meta name="robots" content="noindex" />
      </Head>
      <Redirect to={destination} />
      <p>
        The API overview is now part of the{' '}
        <Link to={destination}>API reference</Link>.
      </p>
    </>
  );
}
