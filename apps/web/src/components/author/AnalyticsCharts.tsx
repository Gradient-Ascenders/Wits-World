interface AnalyticsBarMetric {
  label: string;
  value: number | null;
  displayValue: string;
}

interface AnalyticsBarGroup {
  key: string;
  label: string;
  metrics: AnalyticsBarMetric[];
}

export function AnalyticsBarChart({
  title,
  groups,
}: {
  title: string;
  groups: AnalyticsBarGroup[];
}) {
  const values = groups.flatMap((group) =>
    group.metrics.flatMap((metric) =>
      metric.value === null ? [] : [metric.value],
    ),
  );
  const maximum = Math.max(...values, 1);

  return (
    <div className="analytics-chart-block">
      <h4>{title}</h4>
      <div aria-hidden="true" className="analytics-chart">
        {groups.map((group) => (
          <div className="analytics-chart__group" key={group.key}>
            <p className="analytics-chart__group-label">{group.label}</p>
            <div className="analytics-chart__metrics">
              {group.metrics.map((metric) => (
                <div className="analytics-chart__metric" key={metric.label}>
                  <span className="analytics-chart__metric-label">
                    {metric.label}
                  </span>
                  <span className="analytics-chart__track">
                    <span
                      className="analytics-chart__bar"
                      style={{
                        width:
                          metric.value === null
                            ? '0%'
                            : `${(metric.value / maximum) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="analytics-chart__value">
                    {metric.displayValue}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
