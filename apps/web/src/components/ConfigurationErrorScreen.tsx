interface ConfigurationErrorScreenProps {
  message: string;
}

export function ConfigurationErrorScreen({
  message,
}: ConfigurationErrorScreenProps) {
  return (
    <main
      aria-labelledby="configuration-error-title"
      className="standalone-state"
      role="alert"
    >
      <div className="standalone-state__panel">
        <p className="eyebrow">Setup needed</p>
        <h1 id="configuration-error-title">Wits World is not configured yet</h1>
        <p>{message}</p>
        <p>
          Copy <code>apps/web/.env.example</code> to <code>apps/web/.env</code>,
          then restart the development server.
        </p>
      </div>
    </main>
  );
}
