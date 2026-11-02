create table public.derek_crm_records (
 id text primary key, owner_id uuid not null default auth.uid() references auth.users(id),
 kind text not null default 'sales' check (kind in ('sales','recruit','team')),
 data jsonb not null check (jsonb_typeof(data)='object'), updated_at timestamptz not null default now()
);
create index derek_crm_records_owner on public.derek_crm_records(owner_id);
create table public.derek_crm_updates (
 id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id),
 record_id text not null references public.derek_crm_records(id), data jsonb not null check (jsonb_typeof(data)='object'), created_at timestamptz not null default now()
);
create index derek_crm_updates_owner_record on public.derek_crm_updates(owner_id,record_id);
create table public.derek_crm_settings (
 key text primary key, owner_id uuid not null default auth.uid() references auth.users(id), data jsonb not null, updated_at timestamptz not null default now()
);
create index derek_crm_settings_owner on public.derek_crm_settings(owner_id);
alter table public.derek_crm_records enable row level security;
alter table public.derek_crm_updates enable row level security;
alter table public.derek_crm_settings enable row level security;
revoke all on public.derek_crm_records,public.derek_crm_updates,public.derek_crm_settings from anon;
grant select,insert,update on public.derek_crm_records,public.derek_crm_settings to authenticated;
grant select,insert on public.derek_crm_updates to authenticated;
create policy derek_private_records on public.derek_crm_records for all to authenticated using(owner_id=(select auth.uid()) and owner_id='ba7639ca-0d78-429a-b711-1958374e23ed') with check(owner_id=(select auth.uid()) and owner_id='ba7639ca-0d78-429a-b711-1958374e23ed');
create policy derek_private_updates on public.derek_crm_updates for all to authenticated using(owner_id=(select auth.uid()) and owner_id='ba7639ca-0d78-429a-b711-1958374e23ed') with check(owner_id=(select auth.uid()) and owner_id='ba7639ca-0d78-429a-b711-1958374e23ed' and exists(select 1 from public.derek_crm_records r where r.id=record_id and r.owner_id=(select auth.uid())));
create policy derek_private_settings on public.derek_crm_settings for all to authenticated using(owner_id=(select auth.uid()) and owner_id='ba7639ca-0d78-429a-b711-1958374e23ed') with check(owner_id=(select auth.uid()) and owner_id='ba7639ca-0d78-429a-b711-1958374e23ed');
create function public.derek_crm_save_update(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.derek_crm_records; eid uuid; entry jsonb; updated jsonb; typ text; stamp timestamptz:=now(); existing jsonb;
begin
 if auth.uid() is distinct from 'ba7639ca-0d78-429a-b711-1958374e23ed'::uuid then raise exception 'Owner only'; end if;
 eid:=(payload->>'id')::uuid;
 select data into existing from public.derek_crm_updates where id=eid;
 if found then return jsonb_build_object('saved',true,'duplicate',true,'entry',existing); end if;
 select * into r from public.derek_crm_records where id=payload->>'leadId' and owner_id=auth.uid() for update;
 if not found then raise exception 'Select a valid contact first'; end if;
 if length(trim(coalesce(payload->>'text','')))=0 or length(payload->>'text')>5000 then raise exception 'Add a note of 1-5000 characters'; end if;
 typ:=payload->>'type';
 if typ is null or typ not in ('note','call','booking','show','sale','issued','commission','no_show','followup','onboarded','team_production') then raise exception 'Invalid outcome'; end if;
 if typ in ('sale','issued','commission','team_production') and (coalesce((payload->>'amount')::numeric,0)<=0 or (payload->>'amount')::numeric>10000000) then raise exception 'Enter the actual dollar amount'; end if;
 if typ='booking' and (payload->>'appointmentAt' is null or (payload->>'appointmentAt')::timestamptz is null) then raise exception 'An agreed appointment time is required'; end if;
 if payload ? 'nextAt' and length(payload->>'nextAt')>0 then perform (payload->>'nextAt')::timestamptz; end if;
 if length(coalesce(payload->>'nextStep',''))>500 then raise exception 'Next step is too long'; end if;
 if payload ? 'stage' and payload->>'stage' not in ('new','warm','booked','presented','decision','followup','submitted','issued','closed','do_not_contact','exploring','call_booked','licensed','contracting','onboarded','active') then raise exception 'Invalid stage'; end if;
 entry:=(payload - 'createdAt')||jsonb_build_object('createdAt',stamp,'kind',r.kind,'source',coalesce(payload->>'source','Derek'));
 updated:=r.data||jsonb_build_object('lastNote',payload->>'text','updatedAt',stamp);
 if payload ? 'nextStep' then updated:=updated||jsonb_build_object('nextStep',payload->>'nextStep'); end if;
 if payload ? 'nextAt' then updated:=updated||jsonb_build_object('nextAt',payload->>'nextAt'); end if;
 if payload ? 'stage' then updated:=updated||jsonb_build_object('stage',payload->>'stage'); end if;
 if typ='booking' then updated:=updated||jsonb_build_object('stage','booked','nextAt',payload->>'appointmentAt','nextStep','Prepare for the agreed appointment'); end if;
 if typ='sale' then updated:=updated||jsonb_build_object('stage','submitted','nextStep','Check carrier requirements and issue status'); end if;
 if typ='issued' then updated:=updated||jsonb_build_object('stage','issued','nextStep','Confirm policy delivery and watch for commission'); end if;
 if typ='onboarded' then updated:=updated||jsonb_build_object('stage','onboarded','nextStep','Schedule the first production check-in'); end if;
 insert into public.derek_crm_updates(id,record_id,data) values(eid,r.id,entry);
 update public.derek_crm_records set data=updated,updated_at=stamp where id=r.id;
 return jsonb_build_object('saved',true,'entry',entry,'lead',updated||jsonb_build_object('id',r.id,'kind',r.kind));
end $$;
revoke all on function public.derek_crm_save_update(jsonb) from public,anon;
grant execute on function public.derek_crm_save_update(jsonb) to authenticated;
