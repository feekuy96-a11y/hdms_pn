-- =============================================================================
-- Migration: 20261118000300_detour_point_photos_media_promotion.sql
-- Purpose:
--   Extend public.doh_promote_staged_media(p_temp_url, p_drive_url) to also
--   promote staged media URLs inside public.doh_detour_routes.detour_meta
--   (start_point_photo.url and end_point_photo.url) alongside projects and floods.
--
-- Rollback Plan:
--   Re-run 20261116100000_outbox_media_atomic_promotion.sql to restore the
--   2-table version of public.doh_promote_staged_media(text, text).
-- =============================================================================

create or replace function public.doh_promote_staged_media(
  p_temp_url text,
  p_drive_url text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_projects integer := 0;
  v_floods integer := 0;
  v_detours integer := 0;
begin
  if nullif(trim(p_temp_url), '') is null or nullif(trim(p_drive_url), '') is null then
    raise exception 'media URLs are required';
  end if;

  update public.doh_mitigation_projects
  set before_image_url = case when before_image_url = p_temp_url then p_drive_url else before_image_url end,
      after_image_url = case when after_image_url = p_temp_url then p_drive_url else after_image_url end
  where before_image_url = p_temp_url or after_image_url = p_temp_url;
  get diagnostics v_projects = row_count;

  update public.doh_flood_routes as route
  set latest_photo_url = case when route.latest_photo_url = p_temp_url then p_drive_url else route.latest_photo_url end,
      direction_meta = case
        when jsonb_typeof(route.direction_meta -> 'photos') = 'array' then
          jsonb_set(
            route.direction_meta,
            '{photos}',
            (select jsonb_agg(
              case when photo ->> 'dataUrl' = p_temp_url
                then jsonb_set(photo, '{dataUrl}', to_jsonb(p_drive_url), true)
                else photo
              end
            ) from jsonb_array_elements(route.direction_meta -> 'photos') as photo),
            false
          )
        else route.direction_meta
      end
  where route.latest_photo_url = p_temp_url
     or (jsonb_typeof(route.direction_meta -> 'photos') = 'array'
         and exists (
           select 1 from jsonb_array_elements(route.direction_meta -> 'photos') as photo
           where photo ->> 'dataUrl' = p_temp_url
         ));
  get diagnostics v_floods = row_count;

  update public.doh_detour_routes as detour
  set detour_meta = (
    case
      when detour.detour_meta -> 'end_point_photo' ->> 'url' = p_temp_url then
        jsonb_set(
          case
            when detour.detour_meta -> 'start_point_photo' ->> 'url' = p_temp_url then
              jsonb_set(detour.detour_meta, '{start_point_photo,url}', to_jsonb(p_drive_url), false)
            else detour.detour_meta
          end,
          '{end_point_photo,url}',
          to_jsonb(p_drive_url),
          false
        )
      when detour.detour_meta -> 'start_point_photo' ->> 'url' = p_temp_url then
        jsonb_set(detour.detour_meta, '{start_point_photo,url}', to_jsonb(p_drive_url), false)
      else detour.detour_meta
    end
  )
  where detour.detour_meta -> 'start_point_photo' ->> 'url' = p_temp_url
     or detour.detour_meta -> 'end_point_photo' ->> 'url' = p_temp_url;
  get diagnostics v_detours = row_count;

  return jsonb_build_object(
    'projects', v_projects,
    'floodRoutes', v_floods,
    'detourRoutes', v_detours,
    'total', v_projects + v_floods + v_detours
  );
end;
$$;

revoke all on function public.doh_promote_staged_media(text, text) from public, anon, authenticated;
grant execute on function public.doh_promote_staged_media(text, text) to service_role;
