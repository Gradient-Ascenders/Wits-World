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
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!figureRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(Math.max(300, Math.round(entry.contentRect.width)));
    });
    observer.observe(figureRef.current);
    return () => observer.disconnect();
  }, []);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const maximum = kind === 'dot' ? 100 : chartMaximum(rows);
  const left = width < 650 ? 155 : 230;
  const plotWidth = Math.max(30, width - left - 108);
  const top = references.length ? 52 : 24;
  const rowHeight = 42;
  const bottom = top + rows.length * rowHeight;
  const height = bottom + 56;
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
      <svg
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
                y1={top - 8}
                y2={bottom}
              />
              <text
                className="analytics-plot__tick"
                x={x}
                y={bottom + 22}
                textAnchor="middle"
              >
                {formatTick((maximum * index) / 4)}
              </text>
            </g>
          );
        })}
        {references.map((reference) => {
          const x = left + (reference.value / maximum) * plotWidth;
          return (
            <g key={reference.label} aria-hidden="true">
              <line
                className="analytics-plot__reference"
                x1={x}
                x2={x}
                y1={top - 8}
                y2={bottom}
              />
              <text
                className="analytics-plot__reference-label"
                x={x}
                y={top - 22}
                textAnchor="middle"
              >
                {reference.label}
              </text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const y = top + index * rowHeight + 12;
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
                y={y - 17}
                width={width}
                height={36}
                rx={4}
              />
              <text
                className="analytics-plot__label"
                x={left - 18}
                y={y + 5}
                textAnchor="end"
              >
                {shorten(row.label, width < 650 ? 19 : 30)}
              </text>
              {row.value !== null &&
                (kind === 'dot' ? (
                  <circle
                    className="analytics-plot__mark"
                    cx={left + magnitude}
                    cy={y}
                    r={6}
                  />
                ) : (
                  row.value > 0 && (
                    <rect
                      className="analytics-plot__mark"
                      x={left}
                      y={y - 8}
                      width={magnitude}
                      height={16}
                      rx={3}
                    />
                  )
                ))}
              <text
                className="analytics-plot__value"
                x={left + plotWidth + 16}
                y={y + 5}
              >
                {row.displayValue}
              </text>
            </g>
          );
        })}
        <text
          className="analytics-plot__tick"
          x={left + plotWidth / 2}
          y={height - 5}
          textAnchor="middle"
        >
          {unit}
        </text>
      </svg>
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
