-- Transaction-only integration checks. No test accounts or data remain after rollback.
begin;
create temporary table garage_test_users as select gen_random_uuid() as id,'garage-check-'||n||'@example.invalid' as email,n from generate_series(1,50) n;
insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) select id,email,now(),now(),now() from garage_test_users;
insert into public.t1p_desk_members(id,name) select id,'Test agent '||n from garage_test_users;
insert into public.t1p_desk_memory(owner_id,key,data,updated_at) select id,'dial_scale_check',jsonb_build_object('day','2098-01-01','method','Wavv','period','morning','delta',30,'createdAt','2098-01-01T15:00:00Z'),now() from garage_test_users;
insert into public.t1p_desk_memory(owner_id,key,data,updated_at) select id,'desk_notebook_scale_check','{"kind":"notebook","text":"private test note"}'::jsonb,'2000-01-01' from garage_test_users;
select set_config('garage.test_agent',(select id::text from garage_test_users where n=1),true);
select set_config('garage.test_birch',gen_random_uuid()::text,true);
insert into auth.users(id,email,created_at,updated_at) values(current_setting('garage.test_birch')::uuid,'birchallinsurancelife@gmail.com',now(),now());

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('garage.test_birch'),'role','authenticated')::text,true);
do $$begin
 if public.t1p_desk_is_admin() then raise exception 'Unverified Birch became admin';end if;
 begin perform public.t1p_desk_join_team();raise exception 'Unverified join unexpectedly succeeded';exception when raise_exception then if sqlerrm not like 'Verify your invitation%' then raise;end if;end;
end$$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('garage.test_birch')::uuid;
set local role authenticated;
select public.t1p_desk_join_team();
do $$declare n integer;begin
 if not public.t1p_desk_is_admin() then raise exception 'Verified reserved Birch did not become admin';end if;
 select count(*) into n from public.t1p_desk_daily where day='2098-01-01';if n<>50 then raise exception 'Admin could not read 50 team summaries: %',n;end if;
 select count(*) into n from public.t1p_desk_memory where key='desk_notebook_scale_check';if n<>0 then raise exception 'Admin leaked private notes';end if;
 insert into public.t1p_premium_approvals(owner_id,scope,month,amount,approved_by) values(current_setting('garage.test_birch')::uuid,'personal','2026-10-01',10000,auth.uid());
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('garage.test_agent'),'role','authenticated','user_metadata',jsonb_build_object('admin',true,'role','admin'))::text,true);
do $$declare n integer;begin
 if public.t1p_desk_is_admin() then raise exception 'Regular agent escalated via metadata';end if;
 select count(*) into n from public.t1p_desk_daily where day='2098-01-01';if n<>1 then raise exception 'Agent accessed other summaries';end if;
 if not exists(select 1 from public.t1p_desk_daily where owner_id=auth.uid() and day='2098-01-01' and wavv=30 and morning=10) then raise exception 'Per-agent weighted summary incorrect';end if;
 select count(*) into n from public.t1p_desk_memory where key='desk_notebook_scale_check';if n<>1 then raise exception 'Agent notes not isolated';end if;
 select count(*) into n from public.t1p_desk_invites;if n<>0 then raise exception 'Agent read invitations';end if;
 if has_function_privilege(current_user,'public.t1p_desk_prepare_invite(uuid,text,text)','EXECUTE') then raise exception 'Agent can call server-only invitation function';end if;
 begin insert into public.t1p_desk_invites(email,name) values('forged@example.invalid','Forged');raise exception 'Agent created invitation';exception when insufficient_privilege then null;end;
 begin insert into public.t1p_premium_approvals(owner_id,scope,month,amount,approved_by) values(auth.uid(),'personal','2026-10-01',10000,auth.uid());raise exception 'Agent approved own rank';exception when insufficient_privilege then null;end;
 update public.t1p_desk_memory set data='{"text":"first save"}',updated_at='2000-01-02' where owner_id=auth.uid() and key='desk_notebook_scale_check' and updated_at='2000-01-01';get diagnostics n=row_count;if n<>1 then raise exception 'First versioned save failed';end if;
 update public.t1p_desk_memory set data='{"text":"stale save"}',updated_at='2000-01-03' where owner_id=auth.uid() and key='desk_notebook_scale_check' and updated_at='2000-01-01';get diagnostics n=row_count;if n<>0 then raise exception 'Stale save overwrote new data';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"ba7639ca-0d78-429a-b711-1958374e23ed","role":"authenticated"}',true);
do $$declare n integer;begin
 if not public.t1p_desk_is_admin() then raise exception 'Derek lost admin';end if;
 select count(*) into n from public.t1p_desk_daily where day='2098-01-01';if n<>50 then raise exception 'Derek team access failed';end if;
 select count(*) into n from public.t1p_desk_memory where key='desk_notebook_scale_check';if n<>0 then raise exception 'Derek leaked agent notes';end if;
end$$;
reset role;
do $$begin
 if (select count(*) from desk_private.admins)<>2 then raise exception 'Expected exactly two admin identities';end if;
 if has_function_privilege('anon','public.t1p_desk_is_admin()','EXECUTE') or has_function_privilege('anon','public.t1p_desk_prepare_invite(uuid,text,text)','EXECUTE') then raise exception 'Anonymous admin function access';end if;
end$$;
rollback;
select 'PASS: 50 isolated agent summaries, exact Wavv counts, two admins only, verified-email activation, private notes, blocked escalation/invitations/rank approval, and stale-save protection. All fixtures rolled back.' as result;
