alter table public.events
  add column source_urls text[] not null default array[]::text[];

create function public.content_source_urls_are_valid(source_urls text[])
returns boolean
language sql
immutable
as $$
  select
    array_position(source_urls, null) is null
    and coalesce(
      (
        select bool_and(btrim(source_url) ~ '^https://[^[:space:]]+$')
        from unnest(source_urls) source_url
      ),
      true
    );
$$;

alter table public.events
  add constraint events_source_urls_valid
  check (public.content_source_urls_are_valid(source_urls));

alter table public.challenge_questions
  add column source_urls text[] not null default array[]::text[];

alter table public.challenge_questions
  add constraint challenge_questions_source_urls_valid
  check (public.content_source_urls_are_valid(source_urls));
