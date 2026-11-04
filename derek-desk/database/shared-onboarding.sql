begin;
create schema garage_intake;
revoke all on schema garage_intake from public;
grant usage on schema garage_intake to anon,authenticated;
create table public.t1p_desk_access_requests (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 100),
 email text not null unique check(email=lower(trim(email)) and length(email)<=254),
 status text not null default 'pending' check(status in ('pending','ready','dismissed')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
create index t1p_desk_requests_created on public.t1p_desk_access_requests(created_at);
alter table public.t1p_desk_access_requests enable row level security;
revoke all on public.t1p_desk_access_requests from public,anon,authenticated;
grant select on public.t1p_desk_access_requests to authenticated;
create policy request_admin_read on public.t1p_desk_access_requests for select to authenticated
 using((select desk_private.is_admin()));

-- Deliberately public, narrowly scoped request intake; never provisions an account or grants access.
-- Duplicate submissions cannot replace a name, reopen a dismissed request, or reveal account status.
create function garage_intake.request_access(agent_name text,agent_email text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare clean_name text:=trim(agent_name); mail text:=lower(trim(agent_email));
begin
 if clean_name is null or mail is null or length(clean_name) not between 1 and 100
 or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Enter your name and a valid email address'; end if;
 perform pg_advisory_xact_lock(734921408);
 if exists(select 1 from public.t1p_desk_access_requests where email=mail)
 or exists(select 1 from auth.users u join public.t1p_desk_members m on m.id=u.id where lower(u.email)=mail)
 then return jsonb_build_object('received',true); end if;
 if (select count(*) from public.t1p_desk_access_requests where created_at>now()-interval '24 hours')>=200
 or (select count(*) from public.t1p_desk_access_requests where status='pending')>=2000
 then raise exception 'Requests are busy right now. Contact Derek or Birch for a personal invitation'; end if;
 insert into public.t1p_desk_access_requests(name,email) values(clean_name,mail);
 return jsonb_build_object('received',true);
end $$;
revoke all on function garage_intake.request_access(text,text) from public;
grant execute on function garage_intake.request_access(text,text) to anon,authenticated;
create function public.t1p_desk_request_access(agent_name text,agent_email text) returns jsonb
 language sql security invoker set search_path='' as $$select garage_intake.request_access(agent_name,agent_email)$$;
revoke all on function public.t1p_desk_request_access(text,text) from public;
grant execute on function public.t1p_desk_request_access(text,text) to anon,authenticated;

create function desk_private.review_request(request_id uuid,decision text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not desk_private.is_admin() then raise exception 'Admin access required'; end if;
 if decision not in ('ready','dismissed') or decision is null then raise exception 'Invalid decision'; end if;
 update public.t1p_desk_access_requests set status=decision,reviewed_at=now(),reviewed_by=auth.uid() where id=request_id;
 if not found then raise exception 'Request no longer exists'; end if;
end $$;
revoke all on function desk_private.review_request(uuid,text) from public,anon;
grant execute on function desk_private.review_request(uuid,text) to authenticated;
create function public.t1p_desk_review_request(request_id uuid,decision text) returns void
 language sql security invoker set search_path='' as $$select desk_private.review_request(request_id,decision)$$;
revoke all on function public.t1p_desk_review_request(uuid,text) from public,anon;
grant execute on function public.t1p_desk_review_request(uuid,text) to authenticated;
commit;
