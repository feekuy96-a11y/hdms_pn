-- Phase 1.3 & 1.4 (docs/ADMIN_ROADMAP.md): Admin Audit Trail + Operational Ledger Retention (B-001 Defense-in-Depth, B-024)
--
-- ทำไม (Why):
--   1. ขณะที่หน้า /admin เปิดใช้งานแบบไม่ต้องล็อกอินตามนโยบายปัจจุบัน (B-001) การมีตาราง doh_admin_audit_log
--      แบบ trigger-based ช่วยเก็บประวัติ before/after ของตารางหลัก (doh_flood_routes, doh_detour_routes, doh_highway_layers)
--      เพื่อให้ตรวจสอบย้อนหลังและกู้คืนข้อมูลได้ทันทีหากเกิดความผิดพลาดหรือการแก้ไขโดยไม่ได้ตั้งใจ
--   2. ตาราง doh_event_detour_operations และ doh_external_jobs (status = 'done') เติบโตต่อเนื่องโดยไม่มีการเก็บล้าง (B-024)
--      จึงเพิ่มฟังก์ชัน doh_prune_operational_ledgers และ pg_cron รายวัน (03:15 น. เวลาไทย / 20:15 UTC)
--
-- ผลกระทบ (Impact):
--   - Additive 100% ไม่เปลี่ยนโครงสร้างคอลัมน์หรือสัญญา API/RPC เดิม และไม่กระทบหน้าประชาชน/แอดมินที่รันอยู่
--   - ตัดคอลัมน์อนุพันธ์ (geom, geojson_display) ออกจาก snapshot ของ doh_highway_layers เพื่อลดขนาดตาราง audit
--   - งานลบข้อมูลเก่าจะแตะเฉพาะ doh_external_jobs ที่ status = 'done' เท่านั้น (ไม่แตะ pending/processing/failed)
--
-- แผนย้อนกลับ (Rollback):
--   select cron.unschedule('hdms-prune-operational-ledgers');
--   drop trigger if exists trg_doh_audit_flood_routes on public.doh_flood_routes;
--   drop trigger if exists trg_doh_audit_detour_routes on public.doh_detour_routes;
--   drop trigger if exists trg_doh_audit_highway_layers on public.doh_highway_layers;
--   drop function if exists public.doh_record_admin_audit_log();
--   drop function if exists public.doh_prune_operational_ledgers(integer, integer, integer);
--   drop table if exists public.doh_admin_audit_log;

-- 1. Admin Audit Log Table (service_role only; zero public/anon exposure)
create table if not exists public.doh_admin_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  actor text not null default current_user,
  changed_at timestamptz not null default now()
);

create index if not exists doh_admin_audit_log_changed_at_idx
  on public.doh_admin_audit_log (changed_at desc);

create index if not exists doh_admin_audit_log_target_idx
  on public.doh_admin_audit_log (table_name, record_id, changed_at desc);

alter table public.doh_admin_audit_log enable row level security;
revoke all on public.doh_admin_audit_log from public, anon, authenticated;
grant select, insert, delete on public.doh_admin_audit_log to service_role;

-- 2. Trigger Function for Before/After Snapshot
create or replace function public.doh_record_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
    if tg_table_name = 'doh_highway_layers' then
      v_old := v_old - 'geom' - 'geojson_display';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
    if tg_table_name = 'doh_highway_layers' then
      v_new := v_new - 'geom' - 'geojson_display';
    end if;
  end if;

  if tg_op = 'UPDATE' and v_old is not distinct from v_new then
    return new;
  end if;

  v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id', '');

  insert into public.doh_admin_audit_log (table_name, record_id, op, old_row, new_row, actor)
  values (tg_table_name, v_record_id, tg_op, v_old, v_new, current_user);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.doh_record_admin_audit_log() from public, anon, authenticated;

drop trigger if exists trg_doh_audit_flood_routes on public.doh_flood_routes;
create trigger trg_doh_audit_flood_routes
  after insert or update or delete on public.doh_flood_routes
  for each row execute function public.doh_record_admin_audit_log();

drop trigger if exists trg_doh_audit_detour_routes on public.doh_detour_routes;
create trigger trg_doh_audit_detour_routes
  after insert or update or delete on public.doh_detour_routes
  for each row execute function public.doh_record_admin_audit_log();

drop trigger if exists trg_doh_audit_highway_layers on public.doh_highway_layers;
create trigger trg_doh_audit_highway_layers
  after insert or update or delete on public.doh_highway_layers
  for each row execute function public.doh_record_admin_audit_log();

-- 3. Operational Ledger & Audit Retention Function (B-024)
create or replace function public.doh_prune_operational_ledgers(
  p_ops_days integer default 90,
  p_jobs_days integer default 90,
  p_audit_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ops_days integer := greatest(coalesce(p_ops_days, 90), 7);
  v_jobs_days integer := greatest(coalesce(p_jobs_days, 90), 7);
  v_audit_days integer := greatest(coalesce(p_audit_days, 180), 30);
  v_ops_deleted integer := 0;
  v_jobs_deleted integer := 0;
  v_audit_deleted integer := 0;
begin
  delete from public.doh_event_detour_operations
  where created_at < now() - make_interval(days => v_ops_days);
  get diagnostics v_ops_deleted = row_count;

  delete from public.doh_external_jobs
  where status = 'done'
    and updated_at < now() - make_interval(days => v_jobs_days);
  get diagnostics v_jobs_deleted = row_count;

  delete from public.doh_admin_audit_log
  where changed_at < now() - make_interval(days => v_audit_days);
  get diagnostics v_audit_deleted = row_count;

  return jsonb_build_object(
    'prunedOperations', v_ops_deleted,
    'prunedExternalJobs', v_jobs_deleted,
    'prunedAuditLogs', v_audit_deleted,
    'opsRetentionDays', v_ops_days,
    'jobsRetentionDays', v_jobs_days,
    'auditRetentionDays', v_audit_days,
    'ranAt', now()
  );
end;
$$;

revoke all on function public.doh_prune_operational_ledgers(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.doh_prune_operational_ledgers(integer, integer, integer) to service_role;

-- 4. Daily Off-Peak Cron Schedule (20:15 UTC = 03:15 ICT)
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hdms-prune-operational-ledgers') then
    perform cron.unschedule('hdms-prune-operational-ledgers');
  end if;
end;
$$;

select cron.schedule(
  'hdms-prune-operational-ledgers',
  '15 20 * * *',
  $job$select public.doh_prune_operational_ledgers(90, 90, 180);$job$
);
