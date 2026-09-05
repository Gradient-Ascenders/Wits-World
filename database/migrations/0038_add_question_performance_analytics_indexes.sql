-- Support the Author-only question-performance aggregate without maintaining a
-- second analytics data store. Completed attempts are the only analytics input.
create index challenge_attempts_completed_event_analytics_idx
  on public.challenge_attempts (event_id, completed_at, id, challenge_id)
  where status = 'completed';

create index challenge_attempts_completed_challenge_analytics_idx
  on public.challenge_attempts (challenge_id, completed_at, id)
  where status = 'completed';

create index challenge_attempts_completed_at_analytics_idx
  on public.challenge_attempts (completed_at, id, event_id, challenge_id)
  where status = 'completed';
