export function Redirect({ to }: { to: string }) {
  return <span data-redirect-to={to} />;
}
