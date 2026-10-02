import { useRef, useState, type KeyboardEvent } from 'react';
import type { PlayerProfile } from '../../api/player-profile';

const dayMs = 86400000;
const labelDate = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function ProfileActivity({ profile }: { profile: PlayerProfile }) {
  const [period, setPeriod] = useState(window.innerWidth < 768 ? 91 : 365);
  const [focused, setFocused] = useState(period - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const end = new Date(`${profile.activityThrough}T12:00:00Z`).getTime();
  const counts = new Map(
    profile.activity?.map((entry) => [entry.date, entry.count]),
  );
  const days = Array.from({ length: period }, (_, index) => {
    const time = new Date(end - (period - index - 1) * dayMs);
    return {
      date: time.toISOString().slice(0, 10),
      time,
      count: counts.get(time.toISOString().slice(0, 10)) ?? 0,
    };
  });
  const startOffset = (days[0]!.time.getUTCDay() + 6) % 7;
  const visibleActivity = days.filter((entry) => entry.count > 0);
  const total = days.reduce((sum, entry) => sum + entry.count, 0);
  const selectedDay = days.find((entry) => entry.date === selected);
  function keydown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
      Home: -index,
      End: period - 1 - index,
    }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = Math.min(Math.max(index + delta, 0), period - 1);
    setFocused(next);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day-index="${next}"]`)
      ?.focus();
  }
  return (
    <section
      className="showcase-activity"
      aria-labelledby="profile-activity-heading"
    >
      <div className="showcase-section-heading">
        <h2 id="profile-activity-heading">Activity</h2>
        {profile.activity !== null ? (
          <select
            aria-label="Activity period"
            value={period}
            onChange={(event) => {
              const next = Number(event.target.value);
              setPeriod(next);
              setFocused(next - 1);
              setSelected(null);
            }}
          >
            <option value={91}>Last 3 months</option>
            <option value={365}>Last year</option>
          </select>
        ) : null}
      </div>
      {profile.activity === null ? (
        <p className="showcase-empty">
          This player keeps their activity private.
        </p>
      ) : (
        <>
          <p className="activity-summary">
            <strong>{total.toLocaleString('en-ZA')}</strong> completed{' '}
            {total === 1 ? 'activity' : 'activities'}{' '}
            {period === 365 ? 'in the last year' : 'in the last 3 months'}
          </p>
          <div className="activity-scroll">
            <div
              className={`activity-calendar${period === 365 ? ' activity-calendar--year' : ''}`}
            >
              <div aria-hidden="true" className="activity-months">
                {Array.from(
                  { length: Math.ceil((period + startOffset) / 7) },
                  (_, index) => {
                    const day = days[Math.max(0, index * 7 - startOffset)];
                    const previous =
                      days[Math.max(0, (index - 1) * 7 - startOffset)];
                    return (
                      <span key={index}>
                        {day &&
                        (index === 0 ||
                          day.time.getUTCMonth() !==
                            previous?.time.getUTCMonth())
                          ? day.time.toLocaleDateString('en-ZA', {
                              month: 'short',
                              timeZone: 'UTC',
                            })
                          : ''}
                      </span>
                    );
                  },
                )}
              </div>
              <div
                className="activity-days"
                aria-label="Daily completed activity. Use arrow keys to explore dates."
                ref={gridRef}
                style={{
                  gridTemplateColumns: `repeat(${Math.ceil((period + startOffset) / 7)}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: startOffset }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {days.map((day, index) => (
                  <button
                    key={day.date}
                    type="button"
                    data-day-index={index}
                    tabIndex={focused === index ? 0 : -1}
                    className={`activity-day activity-day--${day.count === 0 ? 0 : day.count < 2 ? 1 : day.count < 4 ? 2 : day.count < 7 ? 3 : 4}`}
                    aria-label={`${labelDate.format(day.time)}: ${day.count} completed ${day.count === 1 ? 'activity' : 'activities'}`}
                    title={`${labelDate.format(day.time)}: ${day.count}`}
                    onKeyDown={(event) => keydown(event, index)}
                    onFocus={() => {
                      setFocused(index);
                      setSelected(day.date);
                    }}
                    onClick={() => setSelected(day.date)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="activity-legend">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                aria-hidden="true"
                key={level}
                className={`activity-day activity-day--${level}`}
              />
            ))}
            <span>More</span>
          </div>
          <p className="activity-detail" role="status">
            {selectedDay
              ? `${labelDate.format(selectedDay.time)} · ${selectedDay.count} completed ${selectedDay.count === 1 ? 'activity' : 'activities'}`
              : 'Completed challenges and matches. Days follow Johannesburg time.'}
          </p>
          {profile.isOwner && !profile.activityVisible ? (
            <p className="activity-private-note">
              Only you can see this activity.
            </p>
          ) : null}
          {visibleActivity.length ? (
            <details className="activity-list">
              <summary>View activity as a list</summary>
              <ul>
                {visibleActivity
                  .slice()
                  .reverse()
                  .map((day) => (
                    <li key={day.date}>
                      <time dateTime={day.date}>
                        {labelDate.format(day.time)}
                      </time>
                      <span>{day.count} completed</span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : (
            <p className="showcase-empty">
              Your next completed challenge or match will appear here.
            </p>
          )}
        </>
      )}
    </section>
  );
}
