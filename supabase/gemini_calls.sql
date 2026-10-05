-- Run in the Supabase SQL Editor. The Data API routes use a server-side secret key.
create table if not exists public.gemini_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  feature text not null check (feature in ('photo_identification', 'result_explanation')),
  model text not null,
  status text not null check (status in ('pending', 'success', 'gemini_error', 'transport_error', 'parse_error')),
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  upstream_status integer
);

alter table public.gemini_calls enable row level security;
-- Secret/service-role server keys bypass RLS. No anon/user policies or grants are added.
revoke all on public.gemini_calls from anon, authenticated;
grant all on public.gemini_calls to service_role;

-- Useful in Supabase SQL Editor after making test requests:
-- select id, created_at, feature, status, input_tokens, output_tokens,
--        total_tokens, request_summary, response_summary
-- from public.gemini_calls order by created_at desc limit 5;
-- select count(*) as recorded_calls, round(avg(input_tokens)) as avg_input_tokens,
--        round(avg(output_tokens)) as avg_output_tokens
-- from public.gemini_calls;
