type JourneyStage = 'collect' | 'discover' | 'explore';

interface JourneyStageVisualProps {
  stage: JourneyStage;
}

export function HeroMapVisual() {
  return (
    <div aria-hidden="true" className="hero-map">
      <svg className="hero-map__canvas" focusable="false" viewBox="0 0 560 520">
        <defs>
          <pattern
            height="40"
            id="hero-map-grid"
            patternUnits="userSpaceOnUse"
            width="40"
          >
            <path className="hero-map__grid" d="M 40 0 L 0 0 0 40" />
          </pattern>
          <radialGradient id="hero-map-signal">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect fill="url(#hero-map-grid)" height="520" width="560" />
        <path
          className="hero-map__district hero-map__district--one"
          d="M45 112 176 42l108 49-17 104-136 29-83-46Z"
        />
        <path
          className="hero-map__district hero-map__district--two"
          d="m302 72 167 35 49 111-89 78-142-40-34-89Z"
        />
        <path
          className="hero-map__district hero-map__district--three"
          d="m86 275 138-48 105 57-21 157-164 27-91-90Z"
        />
        <path
          className="hero-map__district hero-map__district--four"
          d="m351 306 112-36 64 73-31 111-126 23-61-83Z"
        />

        <path
          className="hero-map__route hero-map__route--quiet"
          d="M37 357c85-12 122-70 180-87 58-18 104 6 151-40 42-41 86-59 153-46"
        />
        <path
          className="hero-map__route"
          d="M91 391c61-28 74-103 146-111 72-7 85 75 155 54 48-15 55-74 93-105"
        />

        <g className="hero-map__landmark" transform="translate(205 127)">
          <path d="M0 60h150M17 60V13h116v47M5 13h140L75 0ZM37 27v33m38-33v33m38-33v33" />
        </g>

        <g className="hero-map__compass" transform="translate(448 76)">
          <circle cx="0" cy="0" r="38" />
          <circle cx="0" cy="0" r="25" />
          <path d="m0-17 7 17-7 17-7-17Z" />
          <path d="M0-46v8M0 38v8M-46 0h8M38 0h8" />
        </g>

        <circle
          className="hero-map__signal-field"
          cx="93"
          cy="391"
          fill="url(#hero-map-signal)"
          r="54"
        />
        <circle className="hero-map__location-ring" cx="93" cy="391" r="16" />
        <circle className="hero-map__location" cx="93" cy="391" r="6" />

        <g className="hero-map__event" transform="translate(485 229)">
          <path d="M0-21c-12 0-21 9-21 21 0 16 21 35 21 35S21 16 21 0C21-12 12-21 0-21Z" />
          <circle cx="0" cy="0" r="6" />
        </g>

        <g className="hero-map__node">
          <circle cx="237" cy="280" r="5" />
          <circle cx="392" cy="334" r="5" />
          <circle cx="307" cy="172" r="4" />
        </g>
      </svg>

      <div className="hero-map__coordinate hero-map__coordinate--top">
        Campus network / 01
      </div>
      <div className="hero-map__coordinate hero-map__coordinate--bottom">
        <span className="technical-signal" />
        Exploration preview
      </div>
    </div>
  );
}

export function JourneyStageVisual({ stage }: JourneyStageVisualProps) {
  if (stage === 'discover') {
    return (
      <svg
        aria-hidden="true"
        className="journey-stage__visual"
        focusable="false"
        viewBox="0 0 120 120"
      >
        <circle className="stage-orbit" cx="60" cy="60" r="43" />
        <path className="stage-line" d="M37 83V38l23 8 23-8v45l-23 8Z" />
        <path className="stage-line stage-line--blue" d="M60 46v45" />
        <circle className="stage-signal" cx="74" cy="60" r="6" />
      </svg>
    );
  }

  if (stage === 'collect') {
    return (
      <svg
        aria-hidden="true"
        className="journey-stage__visual"
        focusable="false"
        viewBox="0 0 120 120"
      >
        <circle className="stage-orbit" cx="60" cy="60" r="43" />
        <rect
          className="stage-line"
          height="53"
          rx="4"
          width="38"
          x="31"
          y="34"
        />
        <rect
          className="stage-line stage-line--blue"
          height="53"
          rx="4"
          width="38"
          x="51"
          y="27"
        />
        <path
          className="stage-star"
          d="m70 40 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="journey-stage__visual"
      focusable="false"
      viewBox="0 0 120 120"
    >
      <circle className="stage-orbit" cx="60" cy="60" r="43" />
      <circle
        className="stage-orbit stage-orbit--inner"
        cx="60"
        cy="60"
        r="29"
      />
      <path className="stage-line" d="m60 34 12 26-12 26-12-26Z" />
      <path className="stage-line stage-line--blue" d="m60 46 5 14-5 6-5-6Z" />
      <path className="stage-tick" d="M60 10v9M60 101v9M10 60h9M101 60h9" />
    </svg>
  );
}

export function MissionMapVisual() {
  return (
    <svg
      aria-hidden="true"
      className="mission-map__canvas"
      focusable="false"
      viewBox="0 0 520 340"
    >
      <path
        className="mission-map__block"
        d="m20 55 132-35 61 55-30 86-135 6Z"
      />
      <path
        className="mission-map__block"
        d="m238 28 127 15 45 97-74 59-116-45Z"
      />
      <path
        className="mission-map__block"
        d="m52 200 128-23 69 73-37 72-143-12Z"
      />
      <path
        className="mission-map__block"
        d="m298 220 146-61 58 62-40 101-140-16Z"
      />
      <path
        className="mission-map__road"
        d="M-10 267c86-42 124-106 207-88 67 15 69 88 143 70 68-16 88-83 192-97"
      />
      <path
        className="mission-map__route"
        d="M61 267c65-36 83-89 142-79 58 10 77 70 132 60 48-9 74-56 111-72"
      />
      <circle className="mission-map__accuracy" cx="61" cy="267" r="30" />
      <circle className="mission-map__location-ring" cx="61" cy="267" r="13" />
      <circle className="mission-map__location" cx="61" cy="267" r="5" />
      <g className="mission-map__event" transform="translate(446 176)">
        <path d="M0-20c-11 0-20 9-20 20 0 15 20 33 20 33S20 15 20 0C20-11 11-20 0-20Z" />
        <circle cx="0" cy="0" r="5" />
      </g>
      <path className="mission-map__north" d="M471 58v-28m0 0-8 13m8-13 8 13" />
    </svg>
  );
}

export function CollectiblePreviewVisual() {
  return (
    <div aria-hidden="true" className="collectible-preview">
      <div className="preview-card preview-card--back">
        <span className="preview-card__index">02</span>
        <span className="preview-card__art preview-card__art--network" />
        <span className="preview-card__category">Wits story</span>
      </div>
      <div className="preview-card preview-card--front">
        <div className="preview-card__topline">
          <span>01</span>
          <span>Card preview</span>
        </div>
        <span className="preview-card__art">
          <span className="preview-card__landmark" />
        </span>
        <span className="preview-card__category">Campus landmark</span>
        <span className="preview-card__rule" />
      </div>
      <span className="collectible-preview__orbit" />
    </div>
  );
}
