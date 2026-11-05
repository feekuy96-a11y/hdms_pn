ALTER POLICY doh_detour_deleted_visibility ON public.doh_detour_routes
USING (
  (deleted_at IS NULL AND (
    flood_id_ref IS NULL OR EXISTS (
      SELECT 1 FROM public.doh_flood_routes f
      WHERE f.id = doh_detour_routes.flood_id_ref AND f.deleted_at IS NULL
    )
  )) OR ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'doh_admin'))
);
