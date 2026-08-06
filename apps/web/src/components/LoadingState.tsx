export function LoadingState() {
  return (
    <div aria-live="polite" className="loading-state" role="status">
      <p className="eyebrow">Please wait</p>
      <p>Loading this Wits Quest page…</p>
    </div>
  );
}
