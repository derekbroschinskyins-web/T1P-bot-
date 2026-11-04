begin;
-- Exactly two reserved admin identities. Browser users cannot read or change this list.
create table desk_private.admins (
 slot text primary key check(slot in ('derek','birch')),
 email text not null unique check(email=lower(trim(email))),
 user_id uuid unique references auth.users(id),
 name text not null
);
alter table desk_private.admins enable row level security;
revoke all on desk_private.admins from public,anon,authenticated;
insert into desk_private.admins(slot,email,user_id,name) values
 ('derek','derekbroschinsky.ins@gmail.com','ba7639ca-0d78-429a-b711-1958374e23ed','Derek Broschinsky'),
 ('birch','birchallinsurancelife@gmail.com',null,'Austin Birchall');

create function desk_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from desk_private.admins a join public.t1p_desk_members m on m.id=a.user_id where a.user_id=auth.uid() and m.active)
$$;
revoke all on function desk_private.is_admin() from public,anon;
grant execute on function desk_private.is_admin() to authenticated;
create function public.t1p_desk_is_admin() returns boolean language sql stable security invoker set search_path='' as $$select desk_private.is_admin()$$;
revoke all on function public.t1p_desk_is_admin() from public,anon;
grant execute on function public.t1p_desk_is_admin() to authenticated;

alter policy member_read on public.t1p_desk_members using(id=(select auth.uid()) or (select desk_private.is_admin()));
alter policy daily_read on public.t1p_desk_daily using(owner_id=(select auth.uid()) or (select desk_private.is_admin()));
alter policy invite_admin on public.t1p_desk_invites using((select desk_private.is_admin())) with check((select desk_private.is_admin()));
-- Invitations are provisioned only through the authenticated server function.
revoke insert,update,delete on public.t1p_desk_invites from authenticated;
grant select on public.t1p_desk_invites to authenticated;
alter table public.t1p_desk_invites add column created_by uuid references auth.users(id);
alter table public.t1p_desk_invites add column updated_at timestamptz not null default now();

alter table public.t1p_premium_approvals drop constraint t1p_premium_approvals_approved_by_check;
alter table public.t1p_premium_approvals alter column approved_by drop default;
alter table public.t1p_premium_approvals add constraint t1p_premium_approver_fk foreign key(approved_by) references auth.users(id);
alter policy premium_read on public.t1p_premium_approvals using(owner_id=(select auth.uid()) or (select desk_private.is_admin()));
alter policy premium_approve on public.t1p_premium_approvals with check((select desk_private.is_admin()) and approved_by=(select auth.uid()));
alter policy premium_correct on public.t1p_premium_approvals using((select desk_private.is_admin())) with check((select desk_private.is_admin()) and approved_by=(select auth.uid()));

create or replace function desk_private.join_team() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mail text; member_name text;
begin
 if uid is null then raise exception 'Sign in first'; end if;
 select lower(email) into mail from auth.users where id=uid and email_confirmed_at is not null;
 if mail is null then raise exception 'Verify your invitation before signing in'; end if;
 if exists(select 1 from public.t1p_desk_members where id=uid and not active) then raise exception 'Your team access is not active. Contact an admin'; end if;
 if not exists(select 1 from public.t1p_desk_members where id=uid and active) then
  select name into member_name from public.t1p_desk_invites where email=mail;
  if member_name is null then raise exception 'Ask Derek or Birch for your invitation link'; end if;
  insert into public.t1p_desk_members(id,name) values(uid,member_name) on conflict(id) do nothing;
 end if;
 -- Admin status comes only from this reserved list and a verified account, never user metadata.
 update desk_private.admins set user_id=uid where email=mail and user_id is null;
 delete from public.t1p_desk_invites where email=mail;
 return jsonb_build_object('joined',true,'admin',desk_private.is_admin());
end $$;

-- Server-only preparation. The Edge Function supplies the verified caller's ID.
create function desk_private.prepare_invite(actor uuid,agent_name text,agent_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; confirmed boolean; mail text:=lower(trim(agent_email)); clean_name text:=trim(agent_name);
begin
 if actor is null or not exists(select 1 from desk_private.admins a join public.t1p_desk_members m on m.id=a.user_id where a.user_id=actor and m.active) then raise exception 'Admin access required'; end if;
 if length(clean_name)<1 or length(clean_name)>100 or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid name and email'; end if;
 perform pg_advisory_xact_lock(hashtextextended(mail,42));
 select id,email_confirmed_at is not null into target,confirmed from auth.users where lower(email)=mail limit 1;
 if exists(select 1 from public.t1p_desk_members where id=target and not active) then raise exception 'This account is inactive. Contact Derek'; end if;
 if exists(select 1 from public.t1p_desk_members where id=target and active) then return jsonb_build_object('mode','existing','email',mail,'name',clean_name); end if;
 insert into public.t1p_desk_invites(email,name,created_by) values(mail,clean_name,actor)
 on conflict(email) do update set name=excluded.name,created_by=actor,updated_at=now();
 return jsonb_build_object('mode',case when confirmed then 'existing' else 'invite' end,'email',mail,'name',clean_name);
end $$;
revoke all on function desk_private.prepare_invite(uuid,text,text) from public,anon,authenticated;
grant usage on schema desk_private to service_role;
grant execute on function desk_private.prepare_invite(uuid,text,text) to service_role;
create function public.t1p_desk_prepare_invite(actor uuid,agent_name text,agent_email text) returns jsonb language sql security invoker set search_path='' as $$select desk_private.prepare_invite(actor,agent_name,agent_email)$$;
revoke all on function public.t1p_desk_prepare_invite(uuid,text,text) from public,anon,authenticated;
grant execute on function public.t1p_desk_prepare_invite(uuid,text,text) to service_role;
-- Birch appears in the pending list, ready for Derek to generate and share his setup link.
insert into public.t1p_desk_invites(email,name,created_by) values('birchallinsurancelife@gmail.com','Austin Birchall','ba7639ca-0d78-429a-b711-1958374e23ed') on conflict(email) do nothing;
commit;
