begin;
create schema if not exists desk_private;
revoke all on schema desk_private from public,anon,authenticated;
create table public.t1p_desk_members(id uuid primary key references auth.users(id),name text not null check(length(name) between 1 and 100),active boolean not null default true);
create table public.t1p_desk_invites(email text primary key check(email=lower(trim(email))),name text not null check(length(name) between 1 and 100),created_at timestamptz not null default now());
create table public.t1p_desk_memory(owner_id uuid not null references public.t1p_desk_members(id),key text not null,data jsonb not null check(jsonb_typeof(data)='object'),updated_at timestamptz not null default now(),primary key(owner_id,key));
create table public.t1p_desk_daily(owner_id uuid not null references public.t1p_desk_members(id),day date not null,hand integer not null default 0,wavv integer not null default 0,morning integer not null default 0,afternoon integer not null default 0,appointments integer not null default 0,presentations integer not null default 0,conversations integer not null default 0,deals integer not null default 0,premium numeric not null default 0,leadership integer not null default 0,updated_at timestamptz not null default now(),primary key(owner_id,day));
alter table public.t1p_desk_members enable row level security;
alter table public.t1p_desk_invites enable row level security;
alter table public.t1p_desk_memory enable row level security;
alter table public.t1p_desk_daily enable row level security;
revoke all on public.t1p_desk_members,public.t1p_desk_invites,public.t1p_desk_memory,public.t1p_desk_daily from anon,authenticated;
grant select on public.t1p_desk_members,public.t1p_desk_daily to authenticated;
grant select,insert,delete on public.t1p_desk_invites to authenticated;
grant select,insert,update on public.t1p_desk_memory to authenticated;
create policy member_read on public.t1p_desk_members for select to authenticated using(id=(select auth.uid()) or (select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed');
create policy invite_admin on public.t1p_desk_invites for all to authenticated using((select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed') with check((select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed');
create policy memory_own on public.t1p_desk_memory for all to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.t1p_desk_members m where m.id=(select auth.uid()) and m.active)) with check(owner_id=(select auth.uid()) and exists(select 1 from public.t1p_desk_members m where m.id=(select auth.uid()) and m.active));
create policy daily_read on public.t1p_desk_daily for select to authenticated using(owner_id=(select auth.uid()) or (select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed');
insert into public.t1p_desk_members(id,name) values('ba7639ca-0d78-429a-b711-1958374e23ed','Derek Broschinsky');
-- Private implementation verifies the authenticated, email-confirmed account against
-- a leader-created invitation. No user-editable metadata is used for authorization.
create function desk_private.join_team() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mail text; member_name text;
begin
 if uid is null then raise exception 'Sign in first';end if;
 if exists(select 1 from public.t1p_desk_members where id=uid and active) then return jsonb_build_object('joined',true);end if;
 select lower(email) into mail from auth.users where id=uid and email_confirmed_at is not null;
 select name into member_name from public.t1p_desk_invites where email=mail;
 if member_name is null then raise exception 'Ask Derek to add your verified email in Team Score first';end if;
 insert into public.t1p_desk_members(id,name) values(uid,member_name) on conflict(id) do nothing;
 delete from public.t1p_desk_invites where email=mail;
 return jsonb_build_object('joined',true);
end $$;
revoke all on function desk_private.join_team() from public,anon;
grant usage on schema desk_private to authenticated;
grant execute on function desk_private.join_team() to authenticated;
create function public.t1p_desk_join_team() returns jsonb language sql security invoker set search_path='' as $$select desk_private.join_team()$$;
revoke all on function public.t1p_desk_join_team() from public,anon;
grant execute on function public.t1p_desk_join_team() to authenticated;
create function desk_private.refresh_score(uid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 delete from public.t1p_desk_daily where owner_id=uid;
 insert into public.t1p_desk_daily(owner_id,day,hand,wavv,morning,afternoon,appointments,presentations,conversations,deals,premium,leadership)
 with memory as materialized (
 select key,data from public.derek_crm_settings where owner_id=uid and uid='ba7639ca-0d78-429a-b711-1958374e23ed'
 union all select key,data from public.t1p_desk_memory where owner_id=uid),
 erased as (select jsonb_array_elements_text(case when jsonb_typeof(data->'eventKeys')='array' then data->'eventKeys' else '[]'::jsonb end) as key from memory where key like 'desk_dial_reset_%'),
 source as (select key,data,coalesce(data->>'day',data->>'date')::date as day,coalesce(data->>'period',case when extract(hour from (data->>'createdAt')::timestamptz at time zone 'America/Denver')<12 then 'morning' else 'afternoon' end) as period from memory where (key like 'dial_%' or key like 'desk_metric_%' or key like 'desk_deal_%' or key like 'desk_leadership_%') and coalesce(data->>'day',data->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and not exists(select 1 from erased where erased.key=memory.key)),
 totals as (select day,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and data->>'method'='Hand dial'),0)) hand,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and data->>'method'='Wavv'),0)) wavv,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and period='morning'),0)) morning,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and period='afternoon'),0)) afternoon,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where data->>'metric'='Appointments set'),0)) appointments,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where data->>'metric'='Presentations'),0)) presentations,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where data->>'metric'='Conversations'),0)) conversations,
 count(*) filter(where key like 'desk_deal_%' and data->>'status'<>'Cancelled') deals,
 coalesce(sum((data->>'amount')::numeric) filter(where key like 'desk_deal_%' and data->>'status'<>'Cancelled'),0) premium,
 count(*) filter(where key like 'desk_leadership_%') leadership from source group by day)
 select uid,day,hand,wavv,morning,afternoon,appointments,presentations,conversations,deals,premium,leadership from totals;
end $$;
revoke all on function desk_private.refresh_score(uuid) from public,anon,authenticated;
create function desk_private.score_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin if new.key like 'dial_%' or new.key like 'desk_%' then perform desk_private.refresh_score(new.owner_id);end if;return new;end$$;
revoke all on function desk_private.score_trigger() from public,anon,authenticated;
create trigger t1p_score_derek after insert or update on public.derek_crm_settings for each row execute function desk_private.score_trigger();
create trigger t1p_score_member after insert or update on public.t1p_desk_memory for each row execute function desk_private.score_trigger();
select desk_private.refresh_score('ba7639ca-0d78-429a-b711-1958374e23ed');
commit;
