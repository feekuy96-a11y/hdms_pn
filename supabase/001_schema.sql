-- =====================================================================
-- ระบบรายงานสถานการณ์น้ำท่วม แขวงทางหลวงปัตตานี  —  Schema v2 (hardened)
-- วางทั้งไฟล์ใน Supabase > SQL Editor แล้วกด Run  (รันซ้ำได้ / อัปเกรดจาก v1 ได้)
--
-- หลักการ: ไม่มี Login แต่ "anon ห้ามเขียนตารางตรงๆ"
--   • อ่านได้ทุกคน (ตาราง/วิวผ่าน RLS select)
--   • เขียนได้เฉพาะผ่านฟังก์ชัน rpc_* ที่ตรวจข้อมูล + บันทึก audit_log ทุกครั้ง
--   • "ลบ" เป็น soft delete (กู้คืนได้ด้วย SQL)
--   • ตั้งรหัสผ่านแอดมินเพิ่มภายหลังได้ (ดูท้ายไฟล์) โดยหน้า /admin ยังไม่ต้อง Login
-- =====================================================================

create extension if not exists postgis  with schema extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 0) ล้างของเก่า (v1): policy, view, rpc เดิม
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('system_settings','highway_routes','flood_incidents','flood_updates')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;

  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (policyname like 'sb\_%' or policyname like '%branding_flood%' or policyname like 'fm\_%')
  loop execute format('drop policy if exists %I on storage.objects', r.policyname); end loop;

  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'rpc\_%' or p.proname like 'fn\_assert%')
  loop execute format('drop function if exists %s cascade', r.sig); end loop;
end $$;

drop view if exists public.v_map_active_floods cascade;
drop view if exists public.v_incidents_full     cascade;
drop view if exists public.v_map_routes         cascade;
drop view if exists public.v_admin_routes       cascade;

-- ---------------------------------------------------------------------
-- 1) ฟังก์ชันพื้นฐาน
-- ---------------------------------------------------------------------
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql set search_path = public, extensions as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 2) ตาราง
-- ---------------------------------------------------------------------
create table if not exists public.system_settings (
  id               smallint primary key default 1,
  system_name      text not null default 'ระบบรายงานสถานการณ์น้ำท่วม',
  organization     text not null default 'แขวงทางหลวงปัตตานี',
  description      text,
  logo_path        text,
  logo_url         text,
  contact_phone    text,
  map_center_lng   double precision not null default 101.2500,
  map_center_lat   double precision not null default 6.8700,
  map_default_zoom numeric(4,2)     not null default 10.00,
  updated_at       timestamptz not null default now(),
  constraint chk_system_settings_singleton check (id = 1)
);
drop trigger if exists trg_system_settings_upd on public.system_settings;
create trigger trg_system_settings_upd before update on public.system_settings
  for each row execute function public.fn_set_updated_at();
insert into public.system_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.highway_routes (
  id          uuid primary key default gen_random_uuid(),
  route_code  text not null,
  route_name  text not null,
  route_type  text not null default 'primary' check (route_type in ('primary','secondary')),
  description text,
  color       text not null default '#1B5E20' check (color ~* '^#[0-9a-f]{6}$'),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  source      text,                          -- เช่น 'shp:ชื่อไฟล์'
  props       jsonb,                         -- attribute เดิมจาก SHP
  geom        geometry(MultiLineString, 4326) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_highway_routes_code unique (route_code),
  constraint chk_highway_routes_geom check (st_isvalid(geom))
);
alter table public.highway_routes add column if not exists source text;
alter table public.highway_routes add column if not exists props  jsonb;
create index if not exists idx_routes_geom   on public.highway_routes using gist (geom);
create index if not exists idx_routes_active on public.highway_routes (is_active, route_type, sort_order);
drop trigger if exists trg_routes_upd on public.highway_routes;
create trigger trg_routes_upd before update on public.highway_routes
  for each row execute function public.fn_set_updated_at();

create table if not exists public.flood_incidents (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid references public.highway_routes(id) on update cascade on delete set null,
  title           text not null,
  location_name   text,
  district        text,
  km_start        numeric(8,3),
  km_end          numeric(8,3),
  status          text not null default 'active' check (status in ('active','resolved')),
  traffic_status  text not null default 'closed'
                  check (traffic_status in ('open_limited','large_vehicle_only','closed')),
  geom_flood      geometry(LineString, 4326) not null,
  geom_detour     geometry(LineString, 4326),
  flood_length_m  numeric(10,2),
  detour_length_m numeric(10,2),
  detour_note     text,
  is_published    boolean not null default true,
  started_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  deleted_at      timestamptz,                -- soft delete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_flood_geom  check (st_isvalid(geom_flood)),
  constraint chk_detour_geom check (geom_detour is null or st_isvalid(geom_detour)),
  constraint chk_km_order    check (km_start is null or km_end is null or km_start <= km_end),
  constraint chk_resolved    check ((status = 'resolved' and resolved_at is not null) or status = 'active'),
  constraint chk_title_len   check (char_length(title) between 1 and 200)
);
alter table public.flood_incidents add column if not exists deleted_at timestamptz;
create index if not exists idx_inc_flood  on public.flood_incidents using gist (geom_flood);
create index if not exists idx_inc_detour on public.flood_incidents using gist (geom_detour);
create index if not exists idx_inc_status on public.flood_incidents (status, is_published, started_at desc) where deleted_at is null;
create index if not exists idx_inc_route  on public.flood_incidents (route_id);

create or replace function public.fn_incident_before_write()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.updated_at      := now();
  new.flood_length_m  := round(st_length(new.geom_flood::geography)::numeric, 2);
  new.detour_length_m := case when new.geom_detour is null then null
                              else round(st_length(new.geom_detour::geography)::numeric, 2) end;
  if new.status = 'resolved' and new.resolved_at is null then new.resolved_at := now();
  elsif new.status = 'active' then new.resolved_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_incident_write on public.flood_incidents;
create trigger trg_incident_write before insert or update on public.flood_incidents
  for each row execute function public.fn_incident_before_write();

create table if not exists public.flood_updates (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.flood_incidents(id) on update cascade on delete cascade,
  water_level_cm numeric(6,1) not null check (water_level_cm >= 0),
  note           text,
  image_paths    text[] not null default '{}',
  reported_by    text,
  recorded_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint chk_images_max check (coalesce(array_length(image_paths, 1), 0) <= 10)
);
alter table public.flood_updates drop constraint if exists chk_level_max;
alter table public.flood_updates add  constraint chk_level_max check (water_level_cm <= 1000);
create index if not exists idx_updates_incident on public.flood_updates (incident_id, recorded_at desc, created_at desc);

-- บันทึกการแก้ไขทั้งหมด (แทน "ใครทำ" เพราะไม่มี Login)
create table if not exists public.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  action text not null,
  detail jsonb
);
-- รหัสผ่านแอดมิน (ไม่บังคับ) — ว่าง = โหมดเปิด
create table if not exists public.admin_secret (
  id        smallint primary key default 1 check (id = 1),
  pass_hash text
);

-- ---------------------------------------------------------------------
-- 3) VIEWS (อ่านอย่างเดียว)
-- ---------------------------------------------------------------------
create view public.v_incidents_full with (security_invoker = true) as
with ranked as (
  select u.*,
         row_number() over (partition by u.incident_id order by u.recorded_at desc, u.created_at desc) as rn,
         count(*)     over (partition by u.incident_id) as cnt
  from public.flood_updates u
)
select
  i.id as incident_id, i.title, i.location_name, i.district, i.km_start, i.km_end,
  i.status, i.traffic_status, i.detour_note, i.flood_length_m, i.detour_length_m,
  i.is_published, i.started_at, i.resolved_at, i.updated_at,
  r.id as route_id, r.route_code, r.route_name, r.route_type,
  l.water_level_cm as latest_level_cm, l.recorded_at as latest_recorded_at,
  l.note as latest_note, l.image_paths as latest_image_paths, l.reported_by as latest_reported_by,
  coalesce(l.cnt, 0)::int as update_count,
  p.water_level_cm as previous_level_cm,
  (l.water_level_cm - p.water_level_cm) as level_diff_cm,
  case when l.id is null then 'no_data'
       when p.id is null then 'new'
       when l.water_level_cm > p.water_level_cm then 'rising'
       when l.water_level_cm < p.water_level_cm then 'falling'
       else 'stable' end as trend,
  st_asgeojson(i.geom_flood, 6)::jsonb  as flood_geojson,
  st_asgeojson(i.geom_detour, 6)::jsonb as detour_geojson,
  st_x(st_lineinterpolatepoint(i.geom_flood, 0.5)) as pin_lng,
  st_y(st_lineinterpolatepoint(i.geom_flood, 0.5)) as pin_lat
from public.flood_incidents i
left join public.highway_routes r on r.id = i.route_id
left join ranked l on l.incident_id = i.id and l.rn = 1
left join ranked p on p.incident_id = i.id and p.rn = 2
where i.deleted_at is null;

create view public.v_map_active_floods with (security_invoker = true) as
select * from public.v_incidents_full where status = 'active' and is_published;

-- เส้นทางสำหรับหน้าประชาชน: ลดจุดให้เบา (~5 ม.) เพื่อประหยัด egress
create view public.v_map_routes with (security_invoker = true) as
select id, route_code, route_name, route_type, color, sort_order,
       st_asgeojson(st_simplifypreservetopology(geom, 0.00005), 5)::jsonb as geojson,
       st_x(st_pointonsurface(geom)) as pin_lng,
       st_y(st_pointonsurface(geom)) as pin_lat
from public.highway_routes
where is_active
order by sort_order, route_code;

create view public.v_admin_routes with (security_invoker = true) as
select id, route_code, route_name, route_type, color, is_active, source,
       round((st_length(geom::geography) / 1000)::numeric, 2) as length_km,
       st_npoints(geom) as points, updated_at
from public.highway_routes
order by route_code;

-- ---------------------------------------------------------------------
-- 4) ฟังก์ชันช่วย (ภายใน)
-- ---------------------------------------------------------------------
create or replace function public.fn_assert_admin(p_pass text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select pass_hash into h from public.admin_secret where id = 1;
  if h is null then return; end if;                       -- ไม่ได้ตั้งรหัส = โหมดเปิด
  if p_pass is null or h <> crypt(p_pass, h) then
    perform pg_sleep(0.6);                                -- หน่วงกันเดารหัส
    raise exception 'PASSCODE_REQUIRED';
  end if;
end $$;

create or replace function public.fn_audit(p_action text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(action, detail) values (p_action, p_detail);
$$;

-- ---------------------------------------------------------------------
-- 5) RPC — อ่าน/ช่วยเหลือ (ไม่ต้องใช้รหัส)
-- ---------------------------------------------------------------------
create or replace function public.rpc_passcode_required()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_secret where pass_hash is not null);
$$;

-- เกาะเส้นตามถนน: ตัดช่วงของ highway_routes ระหว่างจุด A–B (ถนนเดียวกัน, ห่างจากจุดคลิก <= p_max_m)
create or replace function public.rpc_snap_line(
  p_a_lng double precision, p_a_lat double precision,
  p_b_lng double precision, p_b_lat double precision,
  p_max_m double precision default 150)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with pts as (
    select st_setsrid(st_makepoint(p_a_lng, p_a_lat), 4326) as a,
           st_setsrid(st_makepoint(p_b_lng, p_b_lat), 4326) as b,
           least(greatest(p_max_m, 20), 1000) as mx
  ),
  lines as (
    select r.route_code, r.route_name, d.geom as g, p.a, p.b, p.mx
    from pts p
    join public.highway_routes r
      on r.is_active and r.geom && st_expand(p.a, 0.02) and r.geom && st_expand(p.b, 0.02)
    cross join lateral st_dump(st_linemerge(r.geom)) as d
  ),
  cand as (
    select route_code, route_name, g,
           st_distance(g::geography, a::geography) as da,
           st_distance(g::geography, b::geography) as db,
           st_linelocatepoint(g, a) as fa,
           st_linelocatepoint(g, b) as fb
    from lines
    where st_dwithin(g::geography, a::geography, mx) and st_dwithin(g::geography, b::geography, mx)
  ),
  best as (select * from cand where fa <> fb order by da + db limit 1)
  select case when exists (select 1 from best) then
    (select jsonb_build_object(
        'found', true, 'route_code', route_code, 'route_name', route_name,
        'geojson', st_asgeojson(
            case when fa <= fb then st_linesubstring(g, fa, fb)
                 else st_reverse(st_linesubstring(g, fb, fa)) end, 6)::jsonb)
     from best)
  else jsonb_build_object('found', false) end;
$$;

-- ---------------------------------------------------------------------
-- 6) RPC — เขียน (ผ่าน fn_assert_admin + audit)
-- ---------------------------------------------------------------------
create or replace function public.rpc_save_incident(
  p_pass text, p_id uuid, p_title text, p_location text, p_district text, p_traffic text,
  p_flood jsonb, p_detour jsonb, p_detour_note text, p_route_id uuid,
  p_km_start numeric, p_km_end numeric,
  p_level numeric, p_note text, p_reported_by text, p_image_paths text[])
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare g_flood geometry; g_detour geometry; v_exists boolean;
begin
  perform public.fn_assert_admin(p_pass);
  if coalesce(btrim(p_title), '') = '' or char_length(p_title) > 200 then raise exception 'INVALID_TITLE'; end if;

  g_flood := st_setsrid(st_geomfromgeojson(p_flood::text), 4326);
  if geometrytype(g_flood) <> 'LINESTRING' or st_npoints(g_flood) < 2 then raise exception 'INVALID_FLOOD_GEOMETRY'; end if;

  if p_detour is not null and p_detour <> 'null'::jsonb then
    g_detour := st_setsrid(st_geomfromgeojson(p_detour::text), 4326);
    if geometrytype(g_detour) <> 'LINESTRING' then raise exception 'INVALID_DETOUR_GEOMETRY'; end if;
  end if;

  select exists (select 1 from public.flood_incidents where id = p_id) into v_exists;

  if v_exists then
    update public.flood_incidents
       set route_id = p_route_id, title = btrim(p_title), location_name = p_location, district = p_district,
           traffic_status = p_traffic, geom_flood = g_flood, geom_detour = g_detour,
           detour_note = p_detour_note, km_start = p_km_start, km_end = p_km_end
     where id = p_id and deleted_at is null;
  else
    if p_level is null or p_level < 0 or p_level > 1000 then raise exception 'INVALID_LEVEL'; end if;
    insert into public.flood_incidents
      (id, route_id, title, location_name, district, traffic_status, geom_flood, geom_detour, detour_note, km_start, km_end)
    values
      (p_id, p_route_id, btrim(p_title), p_location, p_district, p_traffic, g_flood, g_detour, p_detour_note, p_km_start, p_km_end);
    insert into public.flood_updates (incident_id, water_level_cm, note, reported_by, image_paths)
    values (p_id, p_level, p_note, p_reported_by, coalesce(p_image_paths, '{}'));
  end if;

  perform public.fn_audit('save_incident', jsonb_build_object('id', p_id, 'title', p_title, 'created', not v_exists));
  return p_id;
end $$;

create or replace function public.rpc_add_update(
  p_pass text, p_incident_id uuid, p_level numeric, p_note text, p_reported_by text, p_image_paths text[])
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform public.fn_assert_admin(p_pass);
  if p_level is null or p_level < 0 or p_level > 1000 then raise exception 'INVALID_LEVEL'; end if;
  if not exists (select 1 from public.flood_incidents where id = p_incident_id and deleted_at is null) then
    raise exception 'INCIDENT_NOT_FOUND';
  end if;
  insert into public.flood_updates (incident_id, water_level_cm, note, reported_by, image_paths)
  values (p_incident_id, p_level, p_note, p_reported_by, coalesce(p_image_paths, '{}'))
  returning id into v_id;
  update public.flood_incidents set updated_at = now() where id = p_incident_id;
  perform public.fn_audit('add_update', jsonb_build_object('incident', p_incident_id, 'level', p_level));
  return v_id;
end $$;

create or replace function public.rpc_set_status(p_pass text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.fn_assert_admin(p_pass);
  if p_status not in ('active', 'resolved') then raise exception 'INVALID_STATUS'; end if;
  update public.flood_incidents set status = p_status where id = p_id and deleted_at is null;
  perform public.fn_audit('set_status', jsonb_build_object('id', p_id, 'status', p_status));
end $$;

create or replace function public.rpc_delete_incident(p_pass text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.fn_assert_admin(p_pass);
  update public.flood_incidents set deleted_at = now() where id = p_id;   -- soft delete
  perform public.fn_audit('delete_incident', jsonb_build_object('id', p_id));
end $$;

create or replace function public.rpc_save_settings(
  p_pass text, p_name text, p_org text, p_desc text, p_logo_url text, p_phone text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.fn_assert_admin(p_pass);
  if coalesce(btrim(p_name), '') = '' then raise exception 'INVALID_NAME'; end if;
  update public.system_settings
     set system_name = btrim(p_name), organization = coalesce(nullif(btrim(p_org), ''), organization),
         description = p_desc, contact_phone = p_phone,
         logo_url = coalesce(p_logo_url, logo_url)
   where id = 1;
  perform public.fn_audit('save_settings', jsonb_build_object('name', p_name));
end $$;

-- นำเข้าเส้นทาง (จาก SHP/GeoJSON ที่แปลงในเบราว์เซอร์แล้ว) — upsert ตาม route_code
create or replace function public.rpc_import_routes(p_pass text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; g geometry; n integer := 0; v_type text; v_code text;
begin
  perform public.fn_assert_admin(p_pass);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'INVALID_ROWS'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := left(btrim(coalesce(r->>'route_code', '')), 60);
    continue when v_code = '';
    v_type := case when r->>'route_type' = 'secondary' then 'secondary' else 'primary' end;
    g := st_collectionextract(st_makevalid(st_force2d(st_setsrid(st_geomfromgeojson((r->'geometry')::text), 4326))), 2);
    continue when g is null or st_isempty(g);
    insert into public.highway_routes (route_code, route_name, route_type, color, source, props, geom)
    values (v_code, left(coalesce(nullif(btrim(r->>'route_name'), ''), 'ทล.' || v_code), 200), v_type,
            case when v_type = 'primary' then '#1B5E20' else '#81C784' end,
            left(r->>'source', 200), r->'props', st_multi(g))
    on conflict (route_code) do update
      set route_name = excluded.route_name, route_type = excluded.route_type, color = excluded.color,
          source = excluded.source, props = excluded.props, geom = excluded.geom, is_active = true;
    n := n + 1;
  end loop;
  perform public.fn_audit('import_routes', jsonb_build_object('count', n));
  return n;
end $$;

create or replace function public.rpc_update_route(p_pass text, p_id uuid, p_name text, p_type text, p_active boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.fn_assert_admin(p_pass);
  if p_type not in ('primary', 'secondary') then raise exception 'INVALID_TYPE'; end if;
  update public.highway_routes
     set route_name = coalesce(nullif(btrim(p_name), ''), route_name), route_type = p_type, is_active = p_active,
         color = case when p_type = 'primary' then '#1B5E20' else '#81C784' end
   where id = p_id;
  perform public.fn_audit('update_route', jsonb_build_object('id', p_id));
end $$;

create or replace function public.rpc_delete_route(p_pass text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.fn_assert_admin(p_pass);
  delete from public.highway_routes where id = p_id;
  perform public.fn_audit('delete_route', jsonb_build_object('id', p_id));
end $$;

-- ---------------------------------------------------------------------
-- 7) RLS + สิทธิ์: anon อ่านอย่างเดียว
-- ---------------------------------------------------------------------
alter table public.system_settings enable row level security;
alter table public.highway_routes  enable row level security;
alter table public.flood_incidents enable row level security;
alter table public.flood_updates   enable row level security;
alter table public.audit_log       enable row level security;
alter table public.admin_secret    enable row level security;

create policy fm_select_settings  on public.system_settings for select to anon, authenticated using (true);
create policy fm_select_routes    on public.highway_routes  for select to anon, authenticated using (true);
create policy fm_select_incidents on public.flood_incidents for select to anon, authenticated using (true);
create policy fm_select_updates   on public.flood_updates   for select to anon, authenticated using (true);
-- audit_log / admin_secret: ไม่มี policy = anon เข้าถึงไม่ได้ (ดูผ่าน SQL Editor)

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.system_settings, public.highway_routes, public.flood_incidents, public.flood_updates to anon, authenticated;
grant select on public.v_incidents_full, public.v_map_active_floods, public.v_map_routes, public.v_admin_routes to anon, authenticated;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'rpc\_%'
  loop execute format('grant execute on function %s to anon, authenticated', r.sig); end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) Storage: อ่านสาธารณะ / อัปโหลดได้อย่างเดียว (ไม่มี update/delete)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('branding',     'branding',     true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('flood-images', 'flood-images', true,  512000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy fm_storage_read   on storage.objects for select to anon, authenticated
  using (bucket_id in ('branding', 'flood-images'));
create policy fm_storage_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id in ('branding', 'flood-images'));

-- ---------------------------------------------------------------------
-- 9) Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['flood_incidents', 'flood_updates', 'system_settings'] loop
      begin execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;

select 'Schema v2 พร้อมใช้งาน ✓' as result;

-- =====================================================================
-- (ทางเลือก) ตั้งรหัสผ่านแอดมิน — หน้า /admin ยังเข้าได้โดยไม่ Login
-- ระบบจะถามรหัส "เฉพาะตอนบันทึก/แก้ไขข้อมูล" ครั้งเดียวต่อ session
--   insert into public.admin_secret (id, pass_hash)
--   values (1, crypt('รหัสของคุณ', gen_salt('bf')))
--   on conflict (id) do update set pass_hash = excluded.pass_hash;
--
-- ยกเลิกรหัส:   delete from public.admin_secret;
-- ดูประวัติ:     select * from public.audit_log order by at desc limit 100;
-- กู้เหตุการณ์ที่ลบ: update public.flood_incidents set deleted_at = null where id = '...';
-- =====================================================================
