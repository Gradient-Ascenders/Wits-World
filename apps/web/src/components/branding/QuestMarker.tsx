interface QuestMarkerProps {
  className?: string;
}

export function QuestMarker({ className = '' }: QuestMarkerProps) {
  return (
    <span aria-hidden="true" className={`quest-marker ${className}`.trim()}>
      <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 24 32">
        <path
          className="quest-marker__base"
          d="M12 29s8.5-9.65 8.5-17.5a8.5 8.5 0 1 0-17 0C3.5 19.35 12 29 12 29Z"
        />
        <path
          className="quest-marker__trace"
          d="M12 29s8.5-9.65 8.5-17.5a8.5 8.5 0 1 0-17 0C3.5 19.35 12 29 12 29Z"
          pathLength="1"
        />
        <circle className="quest-marker__orbit" cx="12" cy="11.5" r="3.75" />
        <circle className="quest-marker__beacon" cx="12" cy="11.5" r="1.65" />
      </svg>
    </span>
  );
}
