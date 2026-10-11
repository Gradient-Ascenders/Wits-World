import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { Redirect } from '@docusaurus/router';

const destination = '/docs/architecture/technology-stack#application-stack';

export default function ThirdPartyToolsRedirect() {
  return (
    <>
      <Head>
        <title>Technology stack | Wits World</title>
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <meta name="robots" content="noindex" />
      </Head>
      <Redirect to={destination} />
      <p>
        Third-party tools are now covered in <Link to={destination}>Stack</Link>
        .
      </p>
    </>
  );
}
