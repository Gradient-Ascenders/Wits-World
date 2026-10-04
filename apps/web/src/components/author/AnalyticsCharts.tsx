import { useEffect, useId, useRef, useState } from 'react';

export interface AnalyticsChartRow {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  detail?: string;
  tone?: 'blue' | 'warning' | 'danger';
}

/** Values stay visible beside marks; every row also has a keyboard-readable description. */
export function AnalyticsComparisonChart({
  title,
  rows,
  unit,
  scope,
  kind = 'bar',
  references = [],
}: {
  title: string;
  rows: AnalyticsChartRow[];
  unit: string;
  scope: string;
  kind?: 'bar' | 'dot';
  references?: { value: number; label: string }[];
}) {
  const id = useId();
  const figureRef = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState({
    width: 900,
    fontSize: 12,
    comfortable: false,
  });
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const root = document.documentElement;
    const measure = () => {
      const measuredWidth = figure.getBoundingClientRect().width;
      const label = figure.querySelector('text');
      const rootSize = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      const fontSize = Math.max(
        rootSize * 0.75,
        label ? Number.parseFloat(getComputedStyle(label).fontSize) || 0 : 0,
      );
      const comfortable = root.dataset.reading === 'comfortable';
      setGeometry((previous) => {
        const width =
          measuredWidth > 0 ? Math.floor(measuredWidth) : previous.width;
        return previous.width === width &&
          previous.fontSize === fontSize &&
          previous.comfortable === comfortable
          ? previous
          : { width, fontSize, comfortable };
      });
    };
    measure();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    resizeObserver?.observe(figure);
    const preferenceObserver = new MutationObserver(measure);
    preferenceObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-ui-scale', 'data-reading', 'class', 'style'],
    });
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      preferenceObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const maximum = kind === 'dot' ? 100 : chartMaximum(rows);
  const scale = geometry.fontSize / 12;
  const width = Math.max(geometry.width, 360 * scale);
  const compact = width < 650 * scale;
  const left = (compact ? 155 : 230) * scale;
  const plotWidth = width - left - 108 * scale;
  const referenceSpacing = geometry.fontSize * (geometry.comfortable ? 2 : 1.6);
  const top = 24 * scale + references.length * referenceSpacing;
  const rowHeight = (geometry.comfortable ? 54 : 42) * scale;
  const bottom = top + rows.length * rowHeight;
  const height = bottom + 56 * scale;
  const activeRow = rows.find((row) => row.key === activeKey);

  return (
    <figure
      ref={figureRef}
      className="analytics-plot"
      aria-labelledby={`${id}-title`}
    >
      <figcaption>
        <h4 id={`${id}-title`}>{title}</h4>
        <p>{scope}</p>
      </figcaption>
      <div
        className="analytics-plot__chart"
        tabIndex={0}
        role="region"
        aria-label={`${title} chart`}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`${title}. ${unit}.`}
        >
          {[0, 1, 2, 3, 4].map((index) => {
            const x = left + (plotWidth * index) / 4;
            return (
              <g key={index} aria-hidden="true">
                <line
                  className="analytics-plot__grid"
                  x1={x}
                  x2={x}
                  y1={top - 8 * scale}
                  y2={bottom}
                />
                <text
                  className="analytics-plot__tick"
                  x={x}
                  y={bottom + 22 * scale}
                  textAnchor="middle"
                >
                  {formatTick((maximum * index) / 4)}
                </text>
              </g>
            );
          })}
          {references.map((reference, index) => {
            const x = left + (reference.value / maximum) * plotWidth;
            return (
              <g key={reference.label} aria-hidden="true">
                <line
                  className="analytics-plot__reference"
                  x1={x}
                  x2={x}
                  y1={top - 8 * scale}
                  y2={bottom}
                />
                <text
                  className="analytics-plot__reference-label"
                  x={x}
                  y={top - (index + 1) * referenceSpacing}
                  textAnchor="middle"
                >
                  {reference.label}
                </text>
              </g>
            );
          })}
          {rows.map((row, index) => {
            const y = top + index * rowHeight + 12 * scale;
            const magnitude =
              row.value === null ? 0 : (row.value / maximum) * plotWidth;
            const description = `${row.label}: ${row.displayValue}${row.detail ? `. ${row.detail}` : ''}`;
            return (
              <g
                key={row.key}
                tabIndex={0}
                role="img"
                aria-label={description}
                className={`analytics-plot__row analytics-plot__row--${row.tone ?? 'blue'}`}
                data-active={row.key === activeKey || undefined}
                onFocus={() => setActiveKey(row.key)}
                onBlur={() => setActiveKey(null)}
                onMouseEnter={() => setActiveKey(row.key)}
                onMouseLeave={() => setActiveKey(null)}
              >
                <title>{description}</title>
                <rect
                  className="analytics-plot__highlight"
                  x={0}
                  y={y - 17 * scale}
                  width={width}
                  height={rowHeight - 6 * scale}
                  rx={4}
                />
                <text
                  className="analytics-plot__label"
                  x={left - 18 * scale}
                  y={y + 5 * scale}
                  textAnchor="end"
                >
                  {shorten(row.label, compact ? 19 : 30)}
                </text>
                {row.value !== null &&
                  (kind === 'dot' ? (
                    <circle
                      className="analytics-plot__mark"
                      cx={left + magnitude}
                      cy={y}
                      r={6 * scale}
                    />
                  ) : (
                    row.value > 0 && (
                      <rect
                        className="analytics-plot__mark"
                        x={left}
                        y={y - 8 * scale}
                        width={magnitude}
                        height={16 * scale}
                        rx={3}
                      />
                    )
                  ))}
                <text
                  className="analytics-plot__value"
                  x={left + plotWidth + 16 * scale}
                  y={y + 5 * scale}
                >
                  {row.displayValue}
                </text>
              </g>
            );
          })}
          <text
            className="analytics-plot__tick"
            x={left + plotWidth / 2}
            y={height - 5 * scale}
            textAnchor="middle"
          >
            {unit}
          </text>
        </svg>
      </div>
      {activeRow && (
        <p className="analytics-plot__detail" aria-hidden="true">
          {`${activeRow.label} · ${activeRow.displayValue}${activeRow.detail ? ` · ${activeRow.detail}` : ''}`}
        </p>
      )}
    </figure>
  );
}

function chartMaximum(rows: AnalyticsChartRow[]) {
  const largest = Math.max(
    0,
    ...rows.flatMap((row) => (row.value === null ? [] : [row.value])),
  );
  if (largest <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(largest / 4));
  const step =
    [1, 2, 5, 10].find((value) => value * magnitude * 4 >= largest) ?? 10;
  return step * magnitude * 4;
}
function formatTick(value: number) {
  return value.toLocaleString('en-ZA', { maximumFractionDigits: 1 });
}
function shorten(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
