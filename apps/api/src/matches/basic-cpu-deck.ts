import type { CardCategory } from '../cards/card-types.js';

export interface BasicCpuDeckCardConfiguration {
  cardDefinitionId: string;
  category: CardCategory;
}

export const BASIC_CPU_DECK_CONFIGURATION = [
  {
    cardDefinitionId: '84790040-6ea8-6155-c4b7-dec3a22ac3ab',
    category: 'creature',
  },
  {
    cardDefinitionId: 'eca9b943-9e05-834e-c85c-1175001d897c',
    category: 'creature',
  },
  {
    cardDefinitionId: '27cbcedf-1886-aa81-04b4-089b4c10cd87',
    category: 'creature',
  },
  {
    cardDefinitionId: '0d28241f-a4f2-2cf3-52bc-dee1633b3316',
    category: 'power',
  },
  {
    cardDefinitionId: 'b7485793-8432-2db9-5f99-974164efa788',
    category: 'power',
  },
] as const satisfies readonly BasicCpuDeckCardConfiguration[];
