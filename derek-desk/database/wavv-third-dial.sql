begin;
create or replace function desk_private.refresh_score(uid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 delete from public.t1p_desk_daily where owner_id=uid;
 insert into public.t1p_desk_daily(owner_id,day,hand,wavv,morning,afternoon,appointments,presentations,conversations,deals,premium,leadership)
 with memory as materialized (
 select key,data from public.derek_crm_settings where owner_id=uid and uid='ba7639ca-0d78-429a-b711-1958374e23ed'
 union all select key,data from public.t1p_desk_memory where owner_id=uid),
 erased as (select jsonb_array_elements_text(case when jsonb_typeof(data->'eventKeys')='array' then data->'eventKeys' else '[]'::jsonb end) as key from memory where key like 'desk_dial_reset_%'),
 source as (select key,data,coalesce(data->>'day',data->>'date')::date as day,coalesce(data->>'period',case when extract(hour from (data->>'createdAt')::timestamptz at time zone 'America/Denver')<13 then 'morning' else 'afternoon' end) as period from memory where (key like 'dial_%' or key like 'desk_metric_%' or key like 'desk_deal_%' or key like 'desk_leadership_%') and coalesce(data->>'day',data->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and not exists(select 1 from erased where erased.key=memory.key)),
 totals as (select day,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and data->>'method'='Hand dial'),0)) hand,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and data->>'method'='Wavv'),0)) wavv,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and period='morning' and data->>'method'='Hand dial'),0)) + greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and period='morning' and data->>'method'='Wavv'),0))/3.0 morning,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and period='afternoon' and data->>'method'='Hand dial'),0)) + greatest(0,coalesce(sum((data->>'delta')::integer) filter(where key like 'dial_%' and period='afternoon' and data->>'method'='Wavv'),0))/3.0 afternoon,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where data->>'metric'='Appointments set'),0)) appointments,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where data->>'metric'='Presentations'),0)) presentations,
 greatest(0,coalesce(sum((data->>'delta')::integer) filter(where data->>'metric'='Conversations'),0)) conversations,
 count(*) filter(where key like 'desk_deal_%' and data->>'status'<>'Cancelled') deals,
 coalesce(sum((data->>'amount')::numeric) filter(where key like 'desk_deal_%' and data->>'status'<>'Cancelled'),0) premium,
 count(*) filter(where key like 'desk_leadership_%') leadership from source group by day)
 select uid,day,hand,wavv,morning,afternoon,appointments,presentations,conversations,deals,premium,leadership from totals;
end $$;

revoke all on function desk_private.refresh_score(uuid) from public,anon,authenticated;
select desk_private.refresh_score(id) from public.t1p_desk_members;
commit;
