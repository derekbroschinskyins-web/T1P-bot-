-- T1P Cash Engine — tables, Row Level Security and realtime.
-- Safe to re-run. Additive only: touches nothing else in the project.
-- Paste into Supabase > SQL Editor > New query > Run.

create table if not exists public.cash_policies (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.cash_settings (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null default 'main',
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- keep updated_at honest without the client having to send it
create or replace function public.cash_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cash_policies_touch on public.cash_policies;
create trigger cash_policies_touch before insert or update on public.cash_policies
  for each row execute function public.cash_touch_updated_at();

drop trigger if exists cash_settings_touch on public.cash_settings;
create trigger cash_settings_touch before insert or update on public.cash_settings
  for each row execute function public.cash_touch_updated_at();

-- Row Level Security: a signed-in user can only ever see and write their own rows.
-- Note the policies target the `authenticated` role only, so the `anon` role that
-- the public key in index.html maps to has no access at all.
alter table public.cash_policies enable row level security;
alter table public.cash_settings enable row level security;

drop policy if exists cash_policies_own on public.cash_policies;
create policy cash_policies_own on public.cash_policies
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists cash_settings_own on public.cash_settings;
create policy cash_settings_own on public.cash_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- realtime, so a policy logged on the phone appears on the laptop instantly
alter publication supabase_realtime add table public.cash_policies;
alter publication supabase_realtime add table public.cash_settings;

-- ---------------------------------------------------------------------------
-- Cockpit: leading the agency. Additive; changes no existing table's policies.
-- ---------------------------------------------------------------------------

-- Who counts as the owner. No RLS policies, so it is unreachable through the
-- API; only the security-definer function below can read it.
create table if not exists public.cash_owners (
  email    text primary key,
  added_at timestamptz not null default now()
);
alter table public.cash_owners enable row level security;
-- add yourself here:
-- insert into public.cash_owners(email) values ('you@email.com') on conflict do nothing;

create or replace function public.cash_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cash_owners o
    where lower(o.email) = lower(coalesce(auth.jwt() ->> 'email',''))
  )
$$;

create table if not exists public.cash_checkins (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.cash_journal (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,               -- 'YYYY-MM-DD'
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

drop trigger if exists cash_checkins_touch on public.cash_checkins;
create trigger cash_checkins_touch before insert or update on public.cash_checkins
  for each row execute function public.cash_touch_updated_at();
drop trigger if exists cash_journal_touch on public.cash_journal;
create trigger cash_journal_touch before insert or update on public.cash_journal
  for each row execute function public.cash_touch_updated_at();

alter table public.cash_checkins enable row level security;
alter table public.cash_journal  enable row level security;
drop policy if exists cash_checkins_own on public.cash_checkins;
create policy cash_checkins_own on public.cash_checkins for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists cash_journal_own on public.cash_journal;
create policy cash_journal_own on public.cash_journal for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.cash_checkins;
alter publication supabase_realtime add table public.cash_journal;

-- The roster roll-up. See README for why this is a function and not a view.
-- The full body lives in migration cash_engine_cockpit; re-create it there.

-- Lock the helpers down. Note CREATE OR REPLACE FUNCTION re-grants EXECUTE to
-- PUBLIC, so revoking from anon/authenticated alone is not enough — revoke from
-- PUBLIC too, and re-run this block after any change to these functions.
revoke execute on function public.cash_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.cash_is_owner()         from public, anon, authenticated;
revoke execute on function public.cash_team_pulse()       from public, anon;
grant  execute on function public.cash_team_pulse()       to authenticated;

-- Expected end state:
--   cash_is_owner          anon=false authenticated=false   (internal helper only)
--   cash_team_pulse        anon=false authenticated=true    (owner-gated inside)
--   cash_touch_updated_at  anon=false authenticated=false   (trigger only)
