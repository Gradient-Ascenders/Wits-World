import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { PlayerProfile } from '../../api/player-profile';

const dayMs = 86400000;
interface ActivityTooltip {
  index: number;
  x: number;
  y: number;
  below: boolean;
}
function positionTooltip(
  button: HTMLButtonElement,
  index: number,
): ActivityTooltip | null {
  const bounds = button.getBoundingClientRect();
  if (
    bounds.bottom < 0 ||
    bounds.top > window.innerHeight ||
    bounds.right < 0 ||
    bounds.left > window.innerWidth
  )
    return null;
  const below = bounds.top < 72;
  return {
    index,
    x: Math.min(
      Math.max(bounds.left + bounds.width / 2, 156),
      window.innerWidth - 156,
    ),
    y: below ? bounds.bottom + 10 : bounds.top - 10,
    below,
  };
}
const labelDate = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function ProfileActivity({ profile }: { profile: PlayerProfile }) {
  const [period, setPeriod] = useState(window.innerWidth < 768 ? 91 : 365);
  const [focused, setFocused] = useState(period - 1);
  const [tooltip, setTooltip] = useState<ActivityTooltip | null>(null);
  const tooltipId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const startOffset = days[0]!.time.getUTCDay();
  const visibleActivity = days.filter((entry) => entry.count > 0);
  const total = days.reduce((sum, entry) => sum + entry.count, 0);
  const columns = Math.ceil((period + startOffset) / 7);
  const tooltipDay = tooltip ? days[tooltip.index] : null;
  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
  }, [period, profile.activityThrough]);
  useEffect(() => {
    const hide = () => setTooltip(null);
    const reposition = () => {
      const active = document.activeElement;
      if (
        active instanceof HTMLButtonElement &&
        gridRef.current?.contains(active)
      ) {
        setTooltip(positionTooltip(active, Number(active.dataset.dayIndex)));
      } else hide();
    };
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('keydown', dismiss);
    };
  }, []);
  function showTooltip(button: HTMLButtonElement, index: number) {
    setTooltip(positionTooltip(button, index));
  }
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
              setTooltip(null);
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
          <div className="activity-map">
            <div
              className="activity-scroll"
              ref={scrollRef}
              role="group"
              tabIndex={0}
              aria-label="Activity calendar. Scroll horizontally to view more dates."
            >
              <div
                className="activity-calendar"
                style={{ '--activity-columns': columns } as CSSProperties}
              >
                <div className="activity-weekdays" aria-hidden="true">
                  <span style={{ gridRow: 2 }}>Mon</span>
                  <span style={{ gridRow: 4 }}>Wed</span>
                  <span style={{ gridRow: 6 }}>Fri</span>
                </div>
                <div aria-hidden="true" className="activity-months">
                  {Array.from({ length: columns }, (_, index) => {
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
                  })}
                </div>
                <div
                  className="activity-days"
                  aria-label="Daily completed activity. Use arrow keys to explore dates."
                  ref={gridRef}
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
                      aria-describedby={
                        tooltip?.index === index ? tooltipId : undefined
                      }
                      onKeyDown={(event) => keydown(event, index)}
                      onMouseEnter={(event) =>
                        showTooltip(event.currentTarget, index)
                      }
                      onMouseLeave={(event) => {
                        if (document.activeElement !== event.currentTarget)
                          setTooltip(null);
                      }}
                      onFocus={(event) => {
                        setFocused(index);
                        showTooltip(event.currentTarget, index);
                      }}
                      onBlur={() => setTooltip(null)}
                      onClick={(event) =>
                        showTooltip(event.currentTarget, index)
                      }
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
          </div>
          {profile.isOwner && !profile.activityVisible ? (
            <p className="activity-private-note">
              Only you can see this activity.
            </p>
          ) : null}
          {!visibleActivity.length ? (
            <p className="showcase-empty">
              Your next completed challenge or match will appear here.
            </p>
          ) : null}
        </>
      )}
      <dl className="showcase-stats" aria-label="Player progress">
        {[
          ['Points', profile.points.toLocaleString('en-ZA')],
          ['All-time rank', `#${profile.rank.toLocaleString('en-ZA')}`],
          [
            'Current streak',
            `${profile.currentStreak} ${profile.currentStreak === 1 ? 'day' : 'days'}`,
          ],
          [
            'Best streak',
            `${profile.longestStreak} ${profile.longestStreak === 1 ? 'day' : 'days'}`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {tooltip && tooltipDay
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className={`activity-tooltip${tooltip.below ? ' activity-tooltip--below' : ''}`}
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <strong>
                {tooltipDay.count} completed{' '}
                {tooltipDay.count === 1 ? 'activity' : 'activities'}
              </strong>
              <span>on {labelDate.format(tooltipDay.time)}</span>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
