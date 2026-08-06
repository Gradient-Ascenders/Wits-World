import { Link } from 'wouter';

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="content-page">
      <p className="eyebrow">Page not found</p>
      <h1 id="not-found-title">This route does not exist</h1>
      <p>The page may have moved, or the address may be incorrect.</p>
      <Link className="button button--link" href="/">
        Return home
      </Link>
    </section>
  );
}
