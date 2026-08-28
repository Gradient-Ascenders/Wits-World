import type { StarterAffinity } from './card-types.js';

export interface StarterPackageDefinitionIds {
  creatureDefinitionIds: readonly [string, string, string];
  powerCardDefinitionIds: readonly [string, string];
}

export const starterPackageDefinitions = {
  spark: {
    creatureDefinitionIds: [
      'eca9b943-9e05-834e-c85c-1175001d897c',
      'ec9fb511-5dd2-8164-5f56-d9e13820c713',
      '62d5bb93-78ad-5c44-412c-c7eca5f03250',
    ],
    powerCardDefinitionIds: [
      '0d28241f-a4f2-2cf3-52bc-dee1633b3316',
      'b7485793-8432-2db9-5f99-974164efa788',
    ],
  },
  grit: {
    creatureDefinitionIds: [
      '27cbcedf-1886-aa81-04b4-089b4c10cd87',
      'c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac',
      'fc2c46fb-d960-b1bb-ea9a-93110b79e22d',
    ],
    powerCardDefinitionIds: [
      '49e45cbb-f419-bf5c-2868-757646cb8dc9',
      '17150f89-427c-6bd8-5551-fbaf59b99808',
    ],
  },
  wit: {
    creatureDefinitionIds: [
      '84790040-6ea8-6155-c4b7-dec3a22ac3ab',
      '47f04de3-98d9-79ad-2759-7409c499c5ec',
      'cdd5284b-0aaf-5c50-f820-787a7f6b1506',
    ],
    powerCardDefinitionIds: [
      'a2405856-34a7-f0a8-d1f6-ed0f161ecdab',
      'b862854d-9bc1-2e2e-31f2-c3b31fefcaed',
    ],
  },
} as const satisfies Record<StarterAffinity, StarterPackageDefinitionIds>;
