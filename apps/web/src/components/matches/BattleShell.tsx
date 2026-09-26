import { ArrowLeft } from '@phosphor-icons/react';
import type { ReactNode, RefObject } from 'react';
import { Link } from 'wouter';

type BattleStatusTone =
  'complete' | 'danger' | 'opponent' | 'player' | 'spectator' | 'warning';

interface BattleShellHeaderProps {
  action?: ReactNode;
  backHref: string;
  backLabel: string;
  description?: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  mode: 'Live Ranked' | 'Player Battle' | 'CPU battle';
  opponentLabel: string;
  title?: string;
  turnNumber?: number;
}

export function BattleShellHeader({
  action,
  backHref,
  backLabel,
  description,
  headingRef,
  mode,
  opponentLabel,
  title,
  turnNumber,
}: BattleShellHeaderProps) {
  return (
    <header className="battle-header battle-shell-header">
      <div className="battle-header__navigation">
        <Link className="battle-back-link" href={backHref}>
          <ArrowLeft size={20} aria-hidden="true" /> {backLabel}
        </Link>
        {action}
      </div>
      <div className="battle-header__phase">
        <div className="battle-header__context">
          <strong>{mode}</strong>
          <span>{opponentLabel}</span>
          {turnNumber === undefined ? null : <span>Turn {turnNumber}</span>}
        </div>
        {title ? (
          <div className="battle-header__title-row">
            <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
              {title}
            </h1>
          </div>
        ) : null}
        {description ? (
          <div className="battle-phase-prompt">{description}</div>
        ) : null}
      </div>
    </header>
  );
}

interface BattleStatusDockProps {
  connection?: ReactNode;
  detail: ReactNode;
  label: string;
  timing?: {
    detail: ReactNode;
    label: string;
    tone?: BattleStatusTone;
  };
  tone: BattleStatusTone;
}

export function BattleStatusDock({
  connection,
  detail,
  label,
  timing,
  tone,
}: BattleStatusDockProps) {
  return (
    <section aria-label="Battle status" className="battle-status-dock">
      <div className="battle-status-dock__primary" data-tone={tone}>
        <span>Battle status</span>
        <strong aria-live="polite" className="battle-turn-indicator">
          {label}
        </strong>
        <small>{detail}</small>
      </div>
      {timing ? (
        <div className="battle-status-dock__timing" data-tone={timing.tone}>
          <span>Time</span>
          <strong>{timing.label}</strong>
          <small>{timing.detail}</small>
        </div>
      ) : null}
      {connection ? (
        <div className="battle-status-dock__connection">{connection}</div>
      ) : null}
    </section>
  );
}

interface BattleOutcomePanelProps {
  action: ReactNode;
  children?: ReactNode;
  facts?: Array<{ label: string; value: ReactNode }>;
  mode: 'Live Ranked' | 'Player Battle' | 'CPU battle';
  summary: ReactNode;
  title: string;
  tone: 'defeat' | 'neutral' | 'victory';
  titleId: string;
}

export function BattleOutcomePanel({
  action,
  children,
  facts = [],
  mode,
  summary,
  title,
  tone,
  titleId,
}: BattleOutcomePanelProps) {
  return (
    <section
      aria-labelledby={titleId}
      className={`completed-match battle-outcome battle-outcome--${tone}`}
    >
      <div className="battle-outcome__heading">
        <h2 id={titleId}>{title}</h2>
        <span>{mode}</span>
      </div>
      <p className="battle-outcome__summary">{summary}</p>
      {children}
      {facts.length > 0 ? (
        <dl>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="battle-outcome__actions">{action}</div>
    </section>
  );
}
