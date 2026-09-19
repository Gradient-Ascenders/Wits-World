-- Forward-only hardening required by trust-v1 scoring and enforcement.
-- Migration 0046 remains immutable after publication.


alter table public.challenge_attempts
  add column offline_submission_digest bytea,
  add constraint challenge_attempts_offline_submission_digest_check
    check (
      offline_submission_digest is null
      or octet_length(offline_submission_digest) = 32
    );

comment on column public.challenge_attempts.offline_submission_digest is
  'SHA-256 digest of the privacy-limited canonical pack/timing/answer payload for a newly synced offline submission. Precise locations are excluded. Used only to distinguish an identical retry from conflicting reuse of the same client attempt identifier; historical rows may be null.';


alter table public.cpu_match_actions
  add column submitted_intent jsonb,
  add constraint cpu_match_actions_submitted_intent_check
    check (submitted_intent is null or submission_id is not null);

comment on column public.cpu_match_actions.submitted_intent is
  'Canonical player action submitted for an idempotent CPU-match receipt before any server-authoritative timeout substitution. Historical rows may be null.';

alter table private.trust_case_decisions
  alter column resulting_score_snapshot_id set not null;

create index trust_appeal_resolutions_reviewer_idx
  on private.trust_appeal_resolutions (reviewer_player_id, resolved_at desc, appeal_id);

create index trust_signal_adjustments_original_effective_idx
  on private.trust_signal_adjustments (original_signal_id, effective_at, id);

comment on table private.trust_policy_versions is
  'Immutable identifiers for longitudinal trust policy contracts. Historical trust records keep the policy version that produced them.';

comment on table private.trust_decision_evidence is
  'Append-only junction between an audited trust decision and the safe case-evidence summaries considered by that decision.';

comment on table private.trust_signal_adjustments is
  'Append-only review or appeal adjustments. A reviewed false positive contributes zero to calculations from effective_at onward without deleting its original signal.';

comment on table private.trust_appeal_resolutions is
  'Append-only resolution of one player appeal by a different active Author, including any effective restriction expiry change.';
