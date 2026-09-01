-- 002: link the Discord deal feed to the vault leaderboard
--
-- The T1P Discord bot files closed policies into deals, keyed by Discord user
-- id, with the money in "amount". The vault keys everything by agents.id and
-- reads "premium". These three pieces bridge them.
--
-- Applied to the live project already; kept here so the schema is reviewable.

-- 1. the bridge -------------------------------------------------------------
alter table agents add column if not exists discord_id text;
create unique index if not exists agents_discord_id_key on agents(discord_id) where discord_id is not null;

-- 2. what the site reads ----------------------------------------------------
-- Aggregates only: no client names or per-deal rows leave the database, the
-- same contract sales_board() has, since deals runs RLS with no policies.
-- Week and month are cut in America/Denver so they match the floor's day.
create or replace function public.discord_ap_board()
returns table(agent_id text, ap_week numeric, n_week bigint, ap_month numeric, n_month bigint, ap_all numeric, n_all bigint)
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  with d as (
    select a.id as aid,
           coalesce(dl.premium, dl.amount, 0) as ap,
           (coalesce(dl.submitted_at, dl.created_at) at time zone 'America/Denver') as at_local
    from deals dl
    join agents a on a.discord_id = dl.agent_id
  ),
  n as (select (now() at time zone 'America/Denver') as now_local)
  select d.aid,
    coalesce(sum(d.ap) filter (where date_trunc('week', d.at_local) = date_trunc('week', n.now_local)), 0),
    count(*)           filter (where date_trunc('week', d.at_local) = date_trunc('week', n.now_local)),
    coalesce(sum(d.ap) filter (where date_trunc('month', d.at_local) = date_trunc('month', n.now_local)), 0),
    count(*)           filter (where date_trunc('month', d.at_local) = date_trunc('month', n.now_local)),
    coalesce(sum(d.ap), 0),
    count(*)
  from d cross join n
  group by d.aid;
$function$;

revoke all on function public.discord_ap_board() from public;
grant execute on function public.discord_ap_board() to anon, authenticated, service_role;

-- 3. make the upload survive whatever the bot sends -------------------------
create or replace function public.deals_normalize()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_matches int;
  v_agent   text;
begin
  new.premium := coalesce(new.premium, new.amount);
  new.amount  := coalesce(new.amount, new.premium);

  new.created_at   := coalesce(new.created_at, now());
  new.submitted_at := coalesce(new.submitted_at, new.created_at);

  if new.discord_id is null and new.agent_id ~ '^[0-9]{15,20}$' then
    new.discord_id := new.agent_id;
  end if;

  -- first deal from someone not linked yet: match by first name, but only when
  -- exactly one unlinked agent matches, so an ambiguous name is left alone
  -- rather than credited to the wrong person
  if new.discord_id is not null
     and not exists (select 1 from agents where discord_id = new.discord_id) then
    select count(*), min(a.id) into v_matches, v_agent
    from agents a
    where a.discord_id is null
      and lower(a.name) = lower(split_part(coalesce(new.agent_name, ''), ' ', 1));
    if v_matches = 1 then
      update agents set discord_id = new.discord_id where id = v_agent;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists deals_normalize_trg on deals;
create trigger deals_normalize_trg
  before insert or update on deals
  for each row execute function public.deals_normalize();

-- 4. the reset --------------------------------------------------------------
-- Every deal filed before the reset was kept, not dropped:
--   create table deals_archive (like deals including defaults);
--   alter table deals_archive enable row level security;
--   insert into deals_archive select d.*, now() from deals d;
--   delete from deals;
-- To put them back: insert into deals select <deals columns> from deals_archive;

-- 5. keep every open page current ------------------------------------------
-- deals is not in the realtime publication and its RLS keeps row events from
-- browsers by design. Any change to deals nudges config.deals_ping instead —
-- config broadcasts and is publicly readable — and pages reload on the signal.
create or replace function public.deals_ping()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  insert into config(key, value) values ('deals_ping', extract(epoch from now())::text)
  on conflict (key) do update set value = excluded.value;
  return null;
end;
$function$;

drop trigger if exists deals_ping_trg on deals;
create trigger deals_ping_trg
  after insert or update or delete on deals
  for each statement execute function public.deals_ping();

-- 6. one source of truth for scores ----------------------------------------
-- Per-agent AP by local day, for the Gauntlet and any windowed total.
-- Discord deals only: the Sales tab is a client book and does not score the
-- leaderboard, the team goal, or the Gauntlet.
create or replace function public.ap_daily()
returns table(agent_id text, day date, ap numeric, n bigint)
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select a.id,
         (coalesce(dl.submitted_at, dl.created_at) at time zone 'America/Denver')::date as d,
         coalesce(sum(coalesce(dl.premium, dl.amount, 0)), 0),
         count(*)
  from deals dl
  join agents a on a.discord_id = dl.agent_id
  group by a.id, d;
$function$;

revoke all on function public.ap_daily() from public;
grant execute on function public.ap_daily() to anon, authenticated, service_role;
