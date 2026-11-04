begin;
set local role anon;
do $$begin
 for i in 1..50 loop
  perform public.t1p_desk_request_access('Garage intake test '||i,'garage-intake-test-'||i||'@example.invalid');
 end loop;
 perform public.t1p_desk_request_access('FORGED REPLACEMENT','GARAGE-INTAKE-TEST-1@EXAMPLE.INVALID');
 begin
  perform public.t1p_desk_request_access('', 'invalid');
  raise exception 'TEST FAILURE: invalid request accepted';
 exception when others then
  if sqlerrm like 'TEST FAILURE%' then raise; end if;
 end;
 begin
  perform 1 from public.t1p_desk_access_requests;
  raise exception 'TEST FAILURE: public can read request emails';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$begin
 if (select count(*) from public.t1p_desk_access_requests where email like 'garage-intake-test-%@example.invalid')<>50 then raise exception 'Deduplication failed'; end if;
 if (select name from public.t1p_desk_access_requests where email='garage-intake-test-1@example.invalid')<>'Garage intake test 1' then raise exception 'Duplicate overwrote original'; end if;
 if exists(select 1 from auth.users where email like 'garage-intake-test-%@example.invalid') then raise exception 'Request created auth account'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated","user_metadata":{"admin":true}}',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.t1p_desk_access_requests) then raise exception 'Agent sees access requests'; end if;
 begin
  perform public.t1p_desk_review_request('00000000-0000-4000-a000-000000000002','ready');
  raise exception 'TEST FAILURE: agent can approve';
 exception when others then if sqlerrm like 'TEST FAILURE%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"ba7639ca-0d78-429a-b711-1958374e23ed","role":"authenticated"}',true);
set local role authenticated;
do $$declare rid uuid; begin
 if (select count(*) from public.t1p_desk_access_requests where email like 'garage-intake-test-%@example.invalid')<>50 then raise exception 'Admin missing requests'; end if;
 select id into rid from public.t1p_desk_access_requests where email='garage-intake-test-1@example.invalid';
 perform public.t1p_desk_review_request(rid,'ready');
 if not exists(select 1 from public.t1p_desk_access_requests where id=rid and status='ready' and reviewed_by=auth.uid()) then raise exception 'Review audit missing'; end if;
end $$;
reset role;
select 'PASS: 50 requests; duplicates protected; no automatic accounts; public/agent isolation; admin review audit' as result;
rollback;
