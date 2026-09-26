-- Preserve the privacy-safe aggregate basis for human review of trust signals.
-- Raw match, movement, answer, and provider payloads remain outside trust evidence.

alter table private.trust_signals
  add column review_summary jsonb,
  add constraint trust_signals_review_summary_object_check
    check (
      review_summary is null
      or (
        jsonb_typeof(review_summary) = 'object'
        and (
          (
            signal_type = 'opponent_concentration'
            and review_summary ->> 'kind' = 'opponent_concentration'
            and review_summary ?& array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'completedMatchCount',
              'repeatedOpponentMatchCount',
              'opponentConcentrationRatio',
              'minimumCompletedMatchCount',
              'minimumOpponentConcentrationRatio'
            ]
            and review_summary - array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'completedMatchCount',
              'repeatedOpponentMatchCount',
              'opponentConcentrationRatio',
              'minimumCompletedMatchCount',
              'minimumOpponentConcentrationRatio'
            ] = '{}'::jsonb
          )
          or (
            signal_type = 'one_sided_outcome_pattern'
            and review_summary ->> 'kind' = 'one_sided_outcome_pattern'
            and review_summary ?& array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'qualifyingForfeitCount',
              'minimumQualifyingForfeitCount'
            ]
            and review_summary - array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'qualifyingForfeitCount',
              'minimumQualifyingForfeitCount'
            ] = '{}'::jsonb
          )
        )
      )
    );

alter table private.trust_case_evidence
  add column safe_review_summary jsonb,
  add constraint trust_case_evidence_review_summary_object_check
    check (
      safe_review_summary is null
      or (
        jsonb_typeof(safe_review_summary) = 'object'
        and (
          (
            signal_type = 'opponent_concentration'
            and safe_review_summary ->> 'kind' = 'opponent_concentration'
            and safe_review_summary ?& array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'completedMatchCount',
              'repeatedOpponentMatchCount',
              'opponentConcentrationRatio',
              'minimumCompletedMatchCount',
              'minimumOpponentConcentrationRatio'
            ]
            and safe_review_summary - array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'completedMatchCount',
              'repeatedOpponentMatchCount',
              'opponentConcentrationRatio',
              'minimumCompletedMatchCount',
              'minimumOpponentConcentrationRatio'
            ] = '{}'::jsonb
          )
          or (
            signal_type = 'one_sided_outcome_pattern'
            and safe_review_summary ->> 'kind' = 'one_sided_outcome_pattern'
            and safe_review_summary ?& array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'qualifyingForfeitCount',
              'minimumQualifyingForfeitCount'
            ]
            and safe_review_summary - array[
              'kind',
              'evaluationWindowStart',
              'evaluationWindowEnd',
              'qualifyingForfeitCount',
              'minimumQualifyingForfeitCount'
            ] = '{}'::jsonb
          )
        )
      )
    );

create function private.validate_trust_case_evidence_review_summary()
returns trigger
language plpgsql
as $$
declare
  signal_summary jsonb;
begin
  select review_summary into signal_summary
    from private.trust_signals
   where id = new.original_signal_id;

  if signal_summary is distinct from new.safe_review_summary then
    raise exception 'Trust case evidence review summary must match its source signal'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_case_evidence_review_summary_insert_guard
before insert on private.trust_case_evidence
for each row execute function private.validate_trust_case_evidence_review_summary();

comment on column private.trust_signals.review_summary is
  'Optional immutable privacy-safe aggregate context captured when a derived signal is created. Raw source payloads and counterpart identifiers are prohibited.';

comment on column private.trust_case_evidence.safe_review_summary is
  'Optional immutable reviewer-safe copy of the source signal aggregate context retained with the case evidence.';
