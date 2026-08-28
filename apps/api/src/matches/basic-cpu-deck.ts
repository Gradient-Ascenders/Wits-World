import type { CardCategory } from '../cards/card-types.js';

export interface BasicCpuDeckCardConfiguration {
  cardDefinitionId: string;
  category: CardCategory;
}

export const BASIC_CPU_DECK_CONFIGURATION = [
  {
    cardDefinitionId: 'c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac',
    category: 'creature',
  },
  {
    cardDefinitionId: 'a230fdda-cec0-c127-b4a2-e4dd20660e3a',
    category: 'creature',
  },
  {
    cardDefinitionId: '0cba869b-d777-11f8-6b8c-c47d4d626558',
    category: 'creature',
  },
  {
    cardDefinitionId: '49e45cbb-f419-bf5c-2868-757646cb8dc9',
    category: 'power',
  },
  {
    cardDefinitionId: '76f057c6-efab-38d9-9bcf-298d5c794f1a',
    category: 'power',
  },
] as const satisfies readonly BasicCpuDeckCardConfiguration[];
