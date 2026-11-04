-- One verified premium total per agent, scope, and calendar month.
-- Only Derek can approve, correct, or revoke these records.
begin;
create table public.t1p_premium_approvals (
 owner_id uuid not null references public.t1p_desk_members(id),
 scope text not null check(scope in ('personal','team')),
 month date not null check(extract(day from month)=1 and month>=date '2000-01-01' and month<= (now() at time zone 'America/Denver')::date),
 amount numeric(14,2) not null check(amount>=0 and amount<=100000000),
 approved_by uuid not null default 'ba7639ca-0d78-429a-b711-1958374e23ed' check(approved_by='ba7639ca-0d78-429a-b711-1958374e23ed'),
 approved_at timestamptz not null default now(),
 revoked boolean not null default false,
 primary key(owner_id,scope,month)
);
alter table public.t1p_premium_approvals enable row level security;
revoke all on public.t1p_premium_approvals from public,anon,authenticated;
grant select,insert,update on public.t1p_premium_approvals to authenticated;
create policy premium_read on public.t1p_premium_approvals for select to authenticated using(owner_id=(select auth.uid()) or (select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed');
create policy premium_approve on public.t1p_premium_approvals for insert to authenticated with check((select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed');
create policy premium_correct on public.t1p_premium_approvals for update to authenticated using((select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed') with check((select auth.uid())='ba7639ca-0d78-429a-b711-1958374e23ed');
commit;
