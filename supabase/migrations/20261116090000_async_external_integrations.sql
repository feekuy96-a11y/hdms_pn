-- Durable outbox for temporary media and reporting copies. Supabase records remain authoritative.
-- Rollback after draining jobs and restoring the previous Edge Function:
-- drop triggers doh_flood_report_outbox, doh_detour_report_outbox, doh_project_report_outbox;
-- drop function public.doh_enqueue_external_report(); drop function public.doh_claim_external_jobs(integer);
-- drop table public.doh_external_jobs; remove staged objects, then delete the staging bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hdms-media-staging', 'hdms-media-staging', true, 512000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.doh_external_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('MEDIA', 'REPORT')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists doh_external_jobs_ready_idx
  on public.doh_external_jobs (next_attempt_at, created_at)
  where status in ('pending', 'processing');
create index if not exists doh_flood_routes_direction_meta_media_idx
  on public.doh_flood_routes using gin (direction_meta jsonb_path_ops);
create index if not exists doh_flood_routes_latest_photo_media_idx
  on public.doh_flood_routes (latest_photo_url)
  where latest_photo_url <> '';
alter table public.doh_external_jobs enable row level security;
revoke all on public.doh_external_jobs from anon, authenticated;

create or replace function public.doh_claim_external_jobs(p_limit integer default 3)
returns setof public.doh_external_jobs
language plpgsql security definer set search_path = public
as $$
begin
  return query
    with picked as (
      select j.id from public.doh_external_jobs j
      where ((j.status = 'pending' and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.claimed_at < now() - interval '3 minutes'))
        and j.attempts < 8
      order by j.created_at
      limit least(greatest(p_limit, 1), 10)
      for update skip locked
    )
    update public.doh_external_jobs j
    set status = 'processing', claimed_at = now(), attempts = j.attempts + 1, updated_at = now()
    from picked where j.id = picked.id
    returning j.*;
end;
$$;
revoke all on function public.doh_claim_external_jobs(integer) from public, anon, authenticated;
grant execute on function public.doh_claim_external_jobs(integer) to service_role;

-- Enqueue the reporting copy in the same transaction as the authoritative row.
-- Updates made only by the media worker leave updated_at untouched and do not enqueue again.
create or replace function public.doh_enqueue_external_report()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  r record;
  body jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.updated_at is not distinct from old.updated_at then
      return new;
    end if;
  end if;
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_table_name = 'doh_flood_routes' then
    body := jsonb_build_object('recordId', r.id, 'recordType', 'FLOOD',
      'routeNo', r.route_no, 'sectionName', r.section_name,
      'status', r.traffic_status,
      'isActive', tg_op <> 'DELETE' and r.is_active and r.deleted_at is null,
      'updatedAt', coalesce(r.updated_at, now()));
  elsif tg_table_name = 'doh_detour_routes' then
    body := jsonb_build_object('recordId', r.id, 'recordType', 'DETOUR',
      'routeNo', '', 'sectionName', r.route_name,
      'status', case when r.is_active then 'ACTIVE' else 'INACTIVE' end,
      'isActive', tg_op <> 'DELETE' and r.is_active and r.deleted_at is null,
      'updatedAt', coalesce(r.updated_at, now()));
  else
    body := jsonb_build_object('recordId', r.project_id, 'recordType', 'PROJECT',
      'routeNo', r.route_no, 'sectionName', r.location_name,
      'status', case when tg_op = 'DELETE' then 'DELETED' else r.status_group end,
      'isActive', tg_op <> 'DELETE',
      'updatedAt', coalesce(r.updated_at, now()));
  end if;
  insert into public.doh_external_jobs(kind, payload) values ('REPORT', body);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.doh_enqueue_external_report() from public, anon, authenticated;
drop trigger if exists doh_flood_report_outbox on public.doh_flood_routes;
create trigger doh_flood_report_outbox after insert or update on public.doh_flood_routes
for each row execute function public.doh_enqueue_external_report();
drop trigger if exists doh_detour_report_outbox on public.doh_detour_routes;
create trigger doh_detour_report_outbox after insert or update on public.doh_detour_routes
for each row execute function public.doh_enqueue_external_report();
drop trigger if exists doh_project_report_outbox on public.doh_mitigation_projects;
create trigger doh_project_report_outbox after insert or update or delete on public.doh_mitigation_projects
for each row execute function public.doh_enqueue_external_report();
