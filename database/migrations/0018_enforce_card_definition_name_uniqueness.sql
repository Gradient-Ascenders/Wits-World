-- BASIC-18: card-definition names are reserved globally across every
-- authoring lifecycle state after surrounding whitespace and case are ignored.
-- Migration 0017 must resolve the approved historical Edge collision first.
-- Any other existing collision deliberately makes this migration fail.

create unique index card_definitions_normalized_name_unique_idx
  on public.card_definitions (lower(btrim(name)));
