-- 003: the Metro board — production comes from Metro, the leaderboard is ours
--
-- Two different boards, one source of truth:
--
--   * Metro's board is the whole agency. Everybody Metro posts shows up on it,
--     enrolled here or not. It is a mirror, read-only, nobody's score.
--   * The T1P board is only agents enrolled on this site (a row in agents,
--     which is to say a login). Their individual production marks and the team
--     total are lifted off the Metro snapshot instead of being logged twice.
--
-- A snapshot is a set of rows for one period, captured on one day. Importing
-- the same period again on the same day replaces it, so re-pasting a corrected
-- board is safe. Older captures stay put and the board always reads the newest.

-- 1. the link ---------------------------------------------------------------
-- Metro posts names, not ids, so an enrolled agent carries the name Metro
-- knows them by. Left null it falls back to matching agents.name.
alter table agents add column if not exists metro_name text;
create unique index if not exists agents_metro_name_key
  on agents(lower(metro_name)) where metro_name is not null;

-- 2. the snapshots ----------------------------------------------------------
create table if not exists metro_standings (
  id          bigint generated always as identity primary key,
  period      text        not null check (period in ('week','month','all')),
  captured_on date        not null,
  pos         integer,                      -- Metro's own posted rank, if any
  metro_name  text        not null,
  ap          numeric     not null default 0 check (ap >= 0),
  policies    integer     not null default 0 check (policies >= 0),
  created_at  timestamptz not null default now(),
  unique (period, captured_on, metro_name)
);

create index if not exists metro_standings_period_idx
  on metro_standings(period, captured_on desc);

alter table metro_standings enable row level security;
-- no policies: browsers reach it only through the functions below, same
-- contract deals has.

-- 3. newest capture per period ---------------------------------------------
create or replace view metro_latest as
select s.*
from metro_standings s
join (select period, max(captured_on) as captured_on
        from metro_standings group by period) m
  on m.period = s.period and m.captured_on = s.captured_on;

-- 4. what the site reads ----------------------------------------------------
-- The whole Metro board, every period, with the enrolled agent attached where
-- we can name them. Names and premium only — the same shape Metro posts.
create or replace function public.metro_board()
returns table(period text, captured_on date, pos integer, metro_name text,
              ap numeric, policies integer, agent_id text, enrolled boolean)
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select s.period, s.captured_on, s.pos, s.metro_name, s.ap, s.policies,
         a.id, (a.id is not null)
  from metro_latest s
  left join agents a
    on lower(coalesce(a.metro_name, a.name)) = lower(s.metro_name)
  order by s.period, coalesce(s.pos, 9999), s.ap desc;
$function$;

revoke all on function public.metro_board() from public;
grant execute on function public.metro_board() to anon, authenticated, service_role;

-- Per-enrolled-agent production, shaped exactly like discord_ap_board() so the
-- boards, the team goal and the monthly contracts can read either one.
create or replace function public.metro_ap_board()
returns table(agent_id text, ap_week numeric, n_week bigint, ap_month numeric,
              n_month bigint, ap_all numeric, n_all bigint)
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select a.id,
    coalesce(sum(s.ap)       filter (where s.period = 'week'), 0),
    coalesce(sum(s.policies) filter (where s.period = 'week'), 0)::bigint,
    coalesce(sum(s.ap)       filter (where s.period = 'month'), 0),
    coalesce(sum(s.policies) filter (where s.period = 'month'), 0)::bigint,
    coalesce(sum(s.ap)       filter (where s.period = 'all'), 0),
    coalesce(sum(s.policies) filter (where s.period = 'all'), 0)::bigint
  from agents a
  join metro_latest s
    on lower(s.metro_name) = lower(coalesce(a.metro_name, a.name))
  group by a.id;
$function$;

revoke all on function public.metro_ap_board() from public;
grant execute on function public.metro_ap_board() to anon, authenticated, service_role;

-- 5. the import -------------------------------------------------------------
-- Admin only, pin-checked the same way every other write on this site is.
-- p_rows is the parsed board: [{"pos":1,"name":"Derek B","ap":18250,"policies":6}]
create or replace function public.import_metro_standings(
  p_admin_id text, p_pin text, p_period text, p_rows jsonb,
  p_captured_on date default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_day date := coalesce(p_captured_on, (now() at time zone 'America/Denver')::date);
  v_n   integer;
begin
  if not coalesce(login_agent(p_admin_id, p_pin), false) then
    raise exception 'bad pin';
  end if;
  if not exists (select 1 from agents where id = p_admin_id and is_admin) then
    raise exception 'admins only';
  end if;
  if p_period not in ('week','month','all') then
    raise exception 'period must be week, month or all';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'nothing to import';
  end if;

  -- one capture per period per day: the newest paste wins outright
  delete from metro_standings where period = p_period and captured_on = v_day;

  insert into metro_standings(period, captured_on, pos, metro_name, ap, policies)
  select p_period, v_day,
         nullif(r->>'pos','')::integer,
         btrim(r->>'name'),
         coalesce(nullif(r->>'ap','')::numeric, 0),
         coalesce(nullif(r->>'policies','')::integer, 0)
  from jsonb_array_elements(p_rows) r
  where btrim(coalesce(r->>'name','')) <> ''
  on conflict (period, captured_on, metro_name) do update
    set ap = excluded.ap, policies = excluded.policies, pos = excluded.pos;

  select count(*) into v_n from metro_standings
   where period = p_period and captured_on = v_day;

  -- nudge every open page, same signal deals uses
  insert into config(key, value) values ('metro_ping', extract(epoch from now())::text)
  on conflict (key) do update set value = excluded.value;

  return v_n;
end;
$function$;

revoke all on function public.import_metro_standings(text,text,text,jsonb,date) from public;
grant execute on function public.import_metro_standings(text,text,text,jsonb,date)
  to anon, authenticated, service_role;

-- 6. the manual link --------------------------------------------------------
-- For the agent Metro spells differently than we do. Empty string clears it.
create or replace function public.link_metro_name(
  p_admin_id text, p_pin text, p_agent_id text, p_metro_name text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not coalesce(login_agent(p_admin_id, p_pin), false) then
    raise exception 'bad pin';
  end if;
  if not exists (select 1 from agents where id = p_admin_id and is_admin) then
    raise exception 'admins only';
  end if;
  update agents set metro_name = nullif(btrim(p_metro_name), '')
   where id = p_agent_id;

  insert into config(key, value) values ('metro_ping', extract(epoch from now())::text)
  on conflict (key) do update set value = excluded.value;
end;
$function$;

revoke all on function public.link_metro_name(text,text,text,text) from public;
grant execute on function public.link_metro_name(text,text,text,text)
  to anon, authenticated, service_role;
