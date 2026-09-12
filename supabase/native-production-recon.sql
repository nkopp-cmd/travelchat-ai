-- READ ONLY. No private accounts or rows. Execute only against the verified origin.
BEGIN READ ONLY;
SET LOCAL search_path = '';
-- BYPASSRLS does not grant SQL privileges. FOR SHARE needs UPDATE on at least one column;
-- the disposable fixture uses the minimal UPDATE(id) grant. No public UPDATE is executed.
SELECT pg_catalog.has_schema_privilege('service_role','public','USAGE') AS public_schema_usage,
  pg_catalog.has_column_privilege('service_role','public.spots','id','UPDATE') AS spots_update_id,
  pg_catalog.has_any_column_privilege('service_role','public.spots','UPDATE') AS spots_for_share_update,
  pg_catalog.has_table_privilege('service_role','public.geo_destinations','SELECT') AS destinations_select,
  pg_catalog.has_table_privilege('service_role','public.geo_local_areas','SELECT') AS local_areas_select;
SELECT a.attname, pg_catalog.has_column_privilege('service_role','public.spots',a.attname,'SELECT') AS service_select
FROM pg_catalog.pg_attribute a
WHERE a.attrelid='public.spots'::regclass AND a.attname IN
  ('id','name','address','location','google_place_id','destination_id','local_area_id') AND NOT a.attisdropped
ORDER BY a.attname;
SELECT a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull
FROM pg_catalog.pg_attribute a
WHERE a.attrelid = 'public.spots'::regclass AND a.attname IN
  ('id','name','address','location','google_place_id','destination_id','local_area_id') AND NOT a.attisdropped
ORDER BY a.attname;
SELECT k.conname, k.convalidated, pg_catalog.pg_get_constraintdef(k.oid) AS definition
FROM pg_catalog.pg_constraint k
WHERE k.conrelid IN ('public.spots'::regclass,'public.geo_local_areas'::regclass)
  AND (k.conname IN ('spots_destination_id_fk','spots_local_area_destination_fk','spots_local_area_requires_destination')
    OR (k.conrelid='public.geo_local_areas'::regclass AND k.contype IN ('p','u','f')))
ORDER BY k.conname;
SELECT extname, extversion, extnamespace::regnamespace::text AS schema
FROM pg_catalog.pg_extension WHERE extname = 'postgis';
SELECT id, slug, country_code FROM public.geo_destinations WHERE slug='seoul' AND country_code='KR';
SELECT a.id, a.destination_id, a.slug, a.review_status
FROM public.geo_local_areas a JOIN public.geo_destinations d ON d.id=a.destination_id
WHERE d.slug='seoul' AND d.country_code='KR' ORDER BY a.slug LIMIT 200;
ROLLBACK;
