-- T1P WhatsApp leaderboard bot schema
-- Run this in Supabase > SQL Editor

create table if not exists wa_agents (
  id          bigint generated always as identity primary key,
  phone       text not null unique,          -- digits only, country code included, e.g. 18015551234
  name        text not null,
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists wa_activity (
  id          bigint generated always as identity primary key,
  agent_id    bigint not null references wa_agents(id) on delete cascade,
  kind        text not null check (kind in ('dial','presentation','deal')),
  amount      integer not null check (amount > 0),
  day         date not null,                 -- local business day, computed by the app
  raw_text    text,
  wa_msg_id   text unique,                   -- Meta message id, makes webhook retries idempotent
  created_at  timestamptz not null default now()
);

create index if not exists wa_activity_day_idx on wa_activity(day);
create index if not exists wa_activity_agent_day_idx on wa_activity(agent_id, day);

-- Daily rollup per agent
create or replace view wa_daily as
select
  a.id   as agent_id,
  a.name,
  a.phone,
  t.day,
  coalesce(sum(t.amount) filter (where t.kind = 'dial'), 0)         as dials,
  coalesce(sum(t.amount) filter (where t.kind = 'presentation'), 0) as presentations,
  coalesce(sum(t.amount) filter (where t.kind = 'deal'), 0)         as deals
from wa_agents a
join wa_activity t on t.agent_id = a.id
group by a.id, a.name, a.phone, t.day;
