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
