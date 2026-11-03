-- Keep public image reads, but restrict anonymous upload to controlled folders.
drop policy if exists "Allow public view and upload to flood-images" on storage.objects;
drop policy if exists fm_storage_insert on storage.objects;

create policy fm_storage_insert on storage.objects
for insert to anon, authenticated
with check (
  (bucket_id = 'branding' and (storage.foldername(name))[1] = 'settings')
  or (
    bucket_id = 'flood-images'
    and (storage.foldername(name))[1] = 'projects'
    and lower(coalesce(metadata->>'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
  )
);
