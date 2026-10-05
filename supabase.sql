-- Run once in your Supabase project's SQL Editor.
create table if not exists public.upgrade_checks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor_id uuid not null,
  input jsonb not null,
  output jsonb not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  status text not null check (status in ('success', 'error')),
  model text not null
);
create index if not exists upgrade_checks_status_idx on public.upgrade_checks(status);
alter table public.upgrade_checks enable row level security;
revoke all on public.upgrade_checks from anon, authenticated;
grant select, insert on public.upgrade_checks to service_role;
grant usage, select on sequence public.upgrade_checks_id_seq to service_role;

create table if not exists public.upgradecheck_quota (
  visitor_id uuid primary key,
  used integer not null check (used between 1 and 5),
  created_at timestamptz not null default now()
);
alter table public.upgradecheck_quota enable row level security;
revoke all on public.upgradecheck_quota from anon, authenticated;
grant select, insert, update on public.upgradecheck_quota to service_role;

create or replace function public.claim_upgradecheck(p_visitor_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare new_used integer;
begin
  insert into public.upgradecheck_quota(visitor_id, used) values (p_visitor_id, 1)
  on conflict (visitor_id) do update set used = public.upgradecheck_quota.used + 1
    where public.upgradecheck_quota.used < 5
  returning used into new_used;
  return new_used is not null;
end;
$$;
revoke all on function public.claim_upgradecheck(uuid) from public, anon, authenticated;
grant execute on function public.claim_upgradecheck(uuid) to service_role;
