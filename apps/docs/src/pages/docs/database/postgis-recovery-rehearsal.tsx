import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { Redirect } from '@docusaurus/router';

const destination = '/docs/database/database-release-procedure#recovery';

export default function DatabaseRecoveryRedirect() {
  return (
    <>
      <Head>
        <title>Database recovery | Wits World</title>
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <meta name="robots" content="noindex" />
      </Head>
      <Redirect to={destination} />
      <p>
        Recovery guidance is now part of{' '}
        <Link to={destination}>Database releases and recovery</Link>.
      </p>
    </>
  );
}
