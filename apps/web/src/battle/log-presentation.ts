/** Display copy only: retain the server's events, ordering, names and values. */
export function battleLogMessage(message: string): string {
  const nextTurn = /^Turn \d+ ended\. (Player|CPU) is next\.$/.exec(message);
  if (nextTurn)
    return nextTurn[1] === 'Player' ? 'Your turn next.' : 'CPU’s turn next.';
  if (message === 'Player won the match.') return 'You won the battle.';
  if (message === 'CPU won the match.') return 'The CPU won the battle.';
  return message
    .replace(/^Player's /, 'Your ')
    .replace(/^CPU's /, 'The CPU’s ')
    .replace(/^Player (selected|sent out|used) /, 'You $1 ');
}

type LogEvent = import('../api/matches').BattleLogEvent;

export function battleLogRows(events: readonly LogEvent[]) {
  const rows: (LogEvent & { effects: LogEvent[] })[] = [];
  for (const event of events) {
    const previous = rows.at(-1);
    if (
      event.kind === 'effect' &&
      previous?.kind === 'action' &&
      event.sequence === previous.sequence
    ) {
      previous.effects.push(event);
    } else {
      rows.push({
        ...event,
        message: battleLogMessage(event.message),
        effects: [],
      });
    }
  }
  return rows;
}

export function battleLogStat(message: string) {
  const match =
    /^(.*) (took|restored|spent|lost) (\d+) (damage|HP|Power)\.$/.exec(message);
  if (!match) return null;
  return {
    creature: battleLogMessage(match[1]!),
    direction: match[2] === 'restored' ? ('up' as const) : ('down' as const),
    value: match[3]!,
    resource: match[4] === 'damage' ? 'HP' : match[4]!,
  };
}
