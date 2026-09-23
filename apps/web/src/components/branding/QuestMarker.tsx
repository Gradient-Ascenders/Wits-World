interface QuestMarkerProps {
  className?: string;
}

export function QuestMarker({ className = '' }: QuestMarkerProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`quest-marker ${className}`.trim()}
      height="32"
      src="/branding/wits-world-quest-marker.svg"
      width="24"
    />
  );
}
