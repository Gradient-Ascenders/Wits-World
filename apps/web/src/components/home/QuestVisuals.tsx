type JourneyStage = 'battle' | 'collect' | 'complete' | 'explore';

interface JourneyStageVisualProps {
  stage: JourneyStage;
}

export function JourneyStageVisual({ stage }: JourneyStageVisualProps) {
  return (
    <svg
      aria-hidden="true"
      className="journey-stage__visual"
      focusable="false"
      viewBox="0 0 64 64"
    >
      <circle className="stage-orbit" cx="32" cy="32" r="27" />
      {stage === 'explore' ? (
        <>
          <circle
            className="stage-orbit stage-orbit--inner"
            cx="32"
            cy="32"
            r="18"
          />
          <path className="stage-line" d="m32 15 8 17-8 17-8-17Z" />
          <path
            className="stage-line stage-line--blue"
            d="m32 23 3 9-3 4-3-4Z"
          />
        </>
      ) : null}
      {stage === 'complete' ? (
        <>
          <path className="stage-line" d="M20 17h24v30H20z" />
          <path className="stage-line stage-line--blue" d="m25 32 5 5 10-12" />
        </>
      ) : null}
      {stage === 'collect' ? (
        <>
          <rect
            className="stage-line"
            height="27"
            rx="2"
            width="20"
            x="17"
            y="20"
          />
          <rect
            className="stage-line stage-line--blue"
            height="27"
            rx="2"
            width="20"
            x="27"
            y="16"
          />
          <path
            className="stage-star"
            d="m37 22 2 4 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1Z"
          />
        </>
      ) : null}
      {stage === 'battle' ? (
        <>
          <path className="stage-line" d="m20 19 24 26M44 19 20 45" />
          <path
            className="stage-line stage-line--blue"
            d="m18 16 8 2-6 6M46 16l-8 2 6 6"
          />
          <circle className="stage-signal" cx="32" cy="32" r="4" />
        </>
      ) : null}
    </svg>
  );
}

export function QuestProgressionVisual() {
  return (
    <svg
      aria-hidden="true"
      className="quest-progression"
      focusable="false"
      viewBox="0 0 780 320"
    >
      <defs>
        <linearGradient id="quest-flow-gradient" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="0.5" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="quest-node-glow">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path
        className="quest-progression__grid-line"
        d="M16 68h748M16 252h748"
      />
      <path
        className="quest-progression__flow"
        d="M91 162c63-69 116 63 188 1 70-60 127 55 202-5 69-56 123 39 207-16"
      />

      <g
        className="quest-progression__stage quest-progression__challenge"
        transform="translate(91 162)"
      >
        <circle className="quest-progression__halo" r="62" />
        <circle className="quest-progression__node" r="37" />
        <path d="M-15-18h30v37h-30zM-8 1l6 6 12-15" />
        <circle className="quest-progression__signal" cy="-18" r="4" />
      </g>

      <g
        className="quest-progression__stage quest-progression__reward"
        transform="translate(283 163)"
      >
        <circle className="quest-progression__halo" r="68" />
        <path
          className="quest-progression__card--back"
          d="m-33-33 39-7 10 65-39 7Z"
        />
        <path
          className="quest-progression__card--back"
          d="m4-40 39 7-11 65-39-7Z"
        />
        <rect height="72" rx="4" width="48" x="-24" y="-40" />
        <path
          className="quest-progression__star"
          d="m0-19 5 10 11 2-8 8 2 11L0 7l-10 5 2-11-8-8 11-2Z"
        />
      </g>

      <g
        className="quest-progression__stage quest-progression__deck"
        transform="translate(486 158)"
      >
        <circle className="quest-progression__halo" r="68" />
        <rect height="78" rx="5" width="56" x="-34" y="-39" />
        <rect
          className="quest-progression__deck-front"
          height="78"
          rx="5"
          width="56"
          x="-21"
          y="-46"
        />
        <path d="m7-26 5 10 11 2-8 8 2 11L7 0-3 5l2-11-8-8 11-2Z" />
        <path
          className="quest-progression__deck-edge"
          d="M-10 42h50M-4 48h38"
        />
      </g>

      <g
        className="quest-progression__stage quest-progression__battle"
        transform="translate(688 142)"
      >
        <circle className="quest-progression__halo" r="72" />
        <circle className="quest-progression__node" r="44" />
        <path d="m-20-21 40 42M20-21l-40 42" />
        <path
          className="quest-progression__blade"
          d="m-25-28 13 3-10 10M25-28l-13 3 10 10"
        />
        <circle className="quest-progression__signal" r="5" />
      </g>

      <g className="quest-progression__labels">
        <text x="91" y="272">
          Campus challenge
        </text>
        <text x="283" y="272">
          Card reward
        </text>
        <text x="486" y="272">
          Deck
        </text>
        <text x="688" y="272">
          Battle
        </text>
      </g>
    </svg>
  );
}
