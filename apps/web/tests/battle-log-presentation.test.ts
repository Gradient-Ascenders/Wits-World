import { describe, expect, it } from 'vitest';
import { battleLogMessage } from '../src/battle/log-presentation';

describe('battle log display copy', () => {
  it.each([
    ["Player's Quillip restored 25 HP.", 'Your Quillip restored 25 HP.'],
    ["CPU's Quillip used Ink Peck.", 'The CPU’s Quillip used Ink Peck.'],
    ['Turn 17 ended. Player is next.', 'Your turn next.'],
    ['Turn 16 ended. CPU is next.', 'CPU’s turn next.'],
    ['Player selected Quillip.', 'You selected Quillip.'],
    ['Player swapped in Quillip.', 'You swapped in Quillip.'],
    ['Player won the match.', 'You won the battle.'],
    ['Unknown event about Player.', 'Unknown event about Player.'],
  ])('formats %s without changing battle facts', (input, output) => {
    expect(battleLogMessage(input)).toBe(output);
  });
});

it('groups an action and its costs and effects without losing events or joining turns', async () => {
  const { battleLogRows } = await import('../src/battle/log-presentation');
  const events = [
    {
      id: '1',
      sequence: 1,
      kind: 'action' as const,
      side: 'player' as const,
      message: "Player's Quillip used Blind Spot.",
    },
    {
      id: '2',
      sequence: 1,
      kind: 'effect' as const,
      side: 'player' as const,
      message: "Player's Quillip spent 1 Power.",
    },
    {
      id: '3',
      sequence: 1,
      kind: 'effect' as const,
      side: 'cpu' as const,
      message: "CPU's Quillip took 16 damage.",
    },
    {
      id: '4',
      sequence: 1,
      kind: 'turn' as const,
      side: 'cpu' as const,
      message: 'Turn 20 ended. CPU is next.',
    },
    {
      id: '5',
      sequence: 2,
      kind: 'effect' as const,
      side: 'cpu' as const,
      message: "CPU's Quillip restored 2 Power.",
    },
  ];
  const original = structuredClone(events);
  expect(battleLogRows(events).map((row) => row.message)).toEqual([
    'Your Quillip used Blind Spot.',
    'CPU’s turn next.',
    'The CPU’s Quillip restored 2 Power.',
  ]);
  expect(battleLogRows(events)[0]?.effects).toEqual(events.slice(1, 3));
  expect(events).toEqual(original);
});
