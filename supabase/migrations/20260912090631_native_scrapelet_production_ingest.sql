-- Generated, unapplied migration. Draft release stage pending catalog verification, backup, and parent activation.
-- Parent must verify the configured origin and SQL catalog before installation.
-- Generated with Supabase CLI 2.117.0. Ingest remains disabled until target validation.
BEGIN;
CREATE SCHEMA native_private;
REVOKE ALL ON SCHEMA native_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA native_private TO service_role;

CREATE TABLE native_private.metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  origin text NOT NULL CHECK (origin = 'https://llehrhqeolfprutcaopi.supabase.co'),
  version text NOT NULL CHECK (version = 'localley-native-production-v1'),
  ingest_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO native_private.metadata(origin, version)
VALUES ('https://llehrhqeolfprutcaopi.supabase.co', 'localley-native-production-v1');

CREATE TABLE native_private.identity_registry (
  source_key text PRIMARY KEY CHECK (source_key ~ '^english[.]visitseoul[.]net:visit-seoul:[0-9]+$'),
  identity_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE native_private.candidates (
  source_key text PRIMARY KEY REFERENCES native_private.identity_registry(source_key),
  observed_at timestamptz NOT NULL,
  source_url text NOT NULL,
  payload text NOT NULL CHECK (octet_length(payload) <= 32000),
  payload_hash text NOT NULL CHECK (payload_hash = encode(sha256(convert_to(payload, 'UTF8')), 'hex')),
  location public.geography(Point,4326) NOT NULL
);
-- Choices and source facts are separate. This binding approves identity, never publication or asset rights.
CREATE TABLE native_private.review_bindings (
  source_key text PRIMARY KEY REFERENCES native_private.identity_registry(source_key),
  spot_id uuid NOT NULL UNIQUE REFERENCES public.spots(id) ON DELETE RESTRICT,
  manifest jsonb NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE native_private.receipts (
  batch_hash text PRIMARY KEY CHECK (batch_hash ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  accepted integer NOT NULL CHECK (accepted BETWEEN 1 AND 1000)
);

ALTER TABLE native_private.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_private.identity_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_private.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_private.review_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_private.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA native_private FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA native_private TO service_role;
GRANT INSERT ON native_private.identity_registry, native_private.review_bindings TO service_role;
GRANT INSERT, UPDATE ON native_private.candidates TO service_role;
GRANT INSERT, DELETE ON native_private.receipts TO service_role;
-- No service-role UPDATE/DELETE on permanent identities or approved bindings.
CREATE POLICY service_metadata ON native_private.metadata FOR SELECT TO service_role USING (true);
CREATE POLICY service_registry ON native_private.identity_registry FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_candidates ON native_private.candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_bindings ON native_private.review_bindings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_receipts ON native_private.receipts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION native_private.assert_schema() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('id','uuid'), ('name','jsonb'), ('address','jsonb'), ('location','public.geography(Point,4326)'),
    ('google_place_id','text'), ('destination_id','uuid'), ('local_area_id','uuid')
  ) AS expected(name, typ) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.spots'::regclass AND a.attname = c.name AND NOT a.attisdropped
      AND pg_catalog.format_type(a.atttypid, a.atttypmod) = c.typ) THEN
      RAISE EXCEPTION 'Required spots schema mismatch';
    END IF;
  END LOOP;
  FOR c IN SELECT * FROM (VALUES
    ('spots_destination_id_fk','FOREIGN KEY (destination_id) REFERENCES public.geo_destinations(id) ON DELETE SET NULL'),
    ('spots_local_area_destination_fk','FOREIGN KEY (local_area_id, destination_id) REFERENCES public.geo_local_areas(id, destination_id) ON DELETE SET NULL (local_area_id)'),
    ('spots_local_area_requires_destination','CHECK (((local_area_id IS NULL) OR (destination_id IS NOT NULL)))')
  ) AS expected(name, definition) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k
      WHERE k.conrelid = 'public.spots'::regclass AND k.conname = c.name AND k.convalidated
      AND pg_catalog.pg_get_constraintdef(k.oid) = c.definition) THEN
      RAISE EXCEPTION 'Required geography constraint mismatch';
    END IF;
  END LOOP;
END;
$$;
SELECT native_private.assert_schema();

CREATE FUNCTION public.native_production_ingest(p_target text, p_origin text, p_body text, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET statement_timeout = '30s' SET lock_timeout = '10s' AS $$
DECLARE
  batch jsonb; item jsonb; fact jsonb; choice jsonb; expected jsonb; actual jsonb;
  key text; observed timestamptz; source text; old native_private.candidates%ROWTYPE;
  seen text[] := '{}'; count_rows integer; current_source text; current_name text;
  mapped_spot_id uuid; bound_spot_ids uuid[] := '{}';
BEGIN
  IF current_user <> 'service_role' OR p_target IS DISTINCT FROM 'production-supabase'
    OR p_origin IS DISTINCT FROM 'https://llehrhqeolfprutcaopi.supabase.co' THEN
    RAISE EXCEPTION 'Production target or role rejected';
  END IF;
  IF p_body IS NULL OR octet_length(p_body) > 8388608
    OR p_hash IS DISTINCT FROM encode(sha256(convert_to(p_body, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Invalid batch hash or size';
  END IF;
  batch := p_body::jsonb;
  IF batch->>'version' IS DISTINCT FROM 'localley-native-production-v1'
    OR batch->'paidProviderCalls' IS DISTINCT FROM '0'::jsonb
    OR batch->'publicationReady' IS DISTINCT FROM 'false'::jsonb
    OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array'
    OR jsonb_typeof(batch->'mappings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid batch'; END IF;
  count_rows := jsonb_array_length(batch->'rows');
  IF count_rows NOT BETWEEN 1 AND 1000 OR jsonb_array_length(batch->'mappings') > count_rows THEN
    RAISE EXCEPTION 'Batch bounds exceeded';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(741923860421::bigint);
  IF NOT EXISTS (SELECT 1 FROM native_private.metadata WHERE origin = p_origin
    AND version = batch->>'version' AND ingest_enabled) THEN RAISE EXCEPTION 'Parent review activation required'; END IF;
  PERFORM native_private.assert_schema();
  DELETE FROM native_private.receipts WHERE imported_at < now() - interval '14 days';
  IF EXISTS (SELECT 1 FROM native_private.receipts WHERE batch_hash = p_hash) THEN
    RETURN jsonb_build_object('repeated',true,'publicationReady',false);
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
    key := item->>'key';
    IF key IS NULL OR key = ANY(seen) OR key !~ '^english[.]visitseoul[.]net:visit-seoul:[0-9]+$'
      OR jsonb_typeof(item->'payload') IS DISTINCT FROM 'string' OR octet_length(item->>'payload') > 32000
      OR item->>'hash' IS DISTINCT FROM encode(sha256(convert_to(item->>'payload','UTF8')), 'hex') THEN
      RAISE EXCEPTION 'Invalid source identity or payload hash';
    END IF;
    seen := array_append(seen,key);
    fact := (item->>'payload')::jsonb;
    source := fact#>>'{provenance,sourceUrl}';
    observed := (fact#>>'{provenance,observedAt}')::timestamptz;
    IF fact->>'kind' IS DISTINCT FROM 'place' OR fact->>'citySlug' IS DISTINCT FROM 'seoul'
      OR fact->>'countryCode' IS DISTINCT FROM 'KR' OR fact->'verified' IS DISTINCT FROM 'false'::jsonb
      OR fact->>'state' IS DISTINCT FROM 'pending'
      OR key IS DISTINCT FROM 'english.visitseoul.net:' || (fact->>'providerPlaceId')
      OR source IS NULL OR source !~ '^https://english[.]visitseoul[.]net/[^?#[:space:]]*(_/[0-9]+|/ENP[A-Za-z0-9]+)/?$'
      OR observed IS NULL OR observed > now() OR observed < now() - interval '56 days'
      OR jsonb_typeof(fact#>'{name,en}') IS DISTINCT FROM 'string'
      OR jsonb_typeof(fact#>'{address,en}') IS DISTINCT FROM 'string'
      OR coalesce(length(btrim(fact#>>'{name,en}')),0) NOT BETWEEN 1 AND 200
      OR coalesce(length(btrim(fact#>>'{address,en}')),0) NOT BETWEEN 1 AND 500
      OR (fact#>>'{name,en}') ~ '[<>[:cntrl:]]' OR (fact#>>'{address,en}') ~ '[<>[:cntrl:]]'
      OR jsonb_typeof(fact->'latitude') IS DISTINCT FROM 'number'
      OR jsonb_typeof(fact->'longitude') IS DISTINCT FROM 'number'
      OR (fact->>'latitude')::numeric NOT BETWEEN 37.15 AND 37.99
      OR (fact->>'longitude')::numeric NOT BETWEEN 126.45 AND 127.50
      OR jsonb_typeof(fact->'images') IS DISTINCT FROM 'array'
      OR jsonb_typeof(fact->'issues') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid private source facts'; END IF;
    IF jsonb_array_length(fact->'images') > 4 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(fact->'issues') issue
      WHERE issue #>> '{}' IN ('outside_city_pilot_radius','missing_or_invalid_coordinates','missing_address')
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(fact->'images') image
      WHERE image->>'sourceUrl' IS NULL
      OR image->>'sourceUrl' !~ '^https://english[.]visitseoul[.]net/comm/getImage[?]([^#[:space:]]*&)?srvcId=MEDIA(&[^#[:space:]]*)?$'
    ) THEN RAISE EXCEPTION 'Invalid source quality'; END IF;
    SELECT * INTO old FROM native_private.candidates WHERE source_key = key;
    IF FOUND AND old.observed_at = observed AND old.payload_hash <> item->>'hash' THEN
      RAISE EXCEPTION 'Equal observation conflict';
    END IF;
    INSERT INTO native_private.identity_registry(source_key) VALUES(key) ON CONFLICT DO NOTHING;
    INSERT INTO native_private.candidates VALUES (key,observed,source,item->>'payload',item->>'hash',
      public.st_setsrid(public.st_makepoint((fact->>'longitude')::double precision,(fact->>'latitude')::double precision),4326)::public.geography)
    ON CONFLICT(source_key) DO UPDATE SET observed_at=excluded.observed_at,source_url=excluded.source_url,
      payload=excluded.payload,payload_hash=excluded.payload_hash,location=excluded.location
    WHERE excluded.observed_at > native_private.candidates.observed_at;
  END LOOP;
  IF (SELECT count(*) FROM native_private.identity_registry) > 5000 THEN RAISE EXCEPTION 'Identity cap exceeded'; END IF;
  seen := '{}';
  FOR choice IN SELECT value FROM jsonb_array_elements(batch->'mappings') LOOP
    key := choice->>'sourceKey'; expected := choice->'expected';
    IF key IS NULL OR key = ANY(seen) OR choice->'identityApproved' IS DISTINCT FROM 'true'::jsonb
      OR choice->>'sourceDomain' IS DISTINCT FROM 'english.visitseoul.net'
      OR jsonb_typeof(expected) IS DISTINCT FROM 'object'
      OR NOT (expected ?& ARRAY['name','address','location','google_place_id','destination_id','local_area_id'])
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch->'rows') r WHERE r->>'key' = key) THEN
      RAISE EXCEPTION 'Explicit complete identity manifest required';
    END IF;
    mapped_spot_id := (choice->>'spotId')::uuid;
    IF mapped_spot_id IS NULL OR mapped_spot_id = ANY(bound_spot_ids) THEN
      RAISE EXCEPTION 'Duplicate or missing binding UUID';
    END IF;
    bound_spot_ids := array_append(bound_spot_ids,mapped_spot_id);
    choice := jsonb_set(choice,'{spotId}',to_jsonb(mapped_spot_id::text));
    seen := array_append(seen,key);
    SELECT source_url, payload::jsonb#>>'{name,en}' INTO current_source,current_name
      FROM native_private.candidates WHERE source_key = key;
    IF choice->>'sourceUrl' IS DISTINCT FROM current_source THEN RAISE EXCEPTION 'Source manifest mismatch'; END IF;
    SELECT jsonb_build_object('name',s.name,'address',s.address,'location',s.location::text,
      'google_place_id',s.google_place_id,'destination_id',s.destination_id,'local_area_id',s.local_area_id)
      INTO actual FROM public.spots s WHERE s.id = mapped_spot_id
      AND s.address->>'en' ILIKE '%Seoul%'
      AND s.name->>'en' = current_name
      AND public.st_y(s.location::public.geometry) BETWEEN 37.15 AND 37.99
      AND public.st_x(s.location::public.geometry) BETWEEN 126.45 AND 127.50 FOR SHARE;
    IF actual IS NULL OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Reviewed public snapshot mismatch'; END IF;
    IF actual->>'destination_id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.geo_destinations WHERE id = (actual->>'destination_id')::uuid AND slug='seoul' AND country_code='KR'
    ) THEN RAISE EXCEPTION 'Destination conflict'; END IF;
    IF actual->>'local_area_id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.geo_local_areas WHERE id=(actual->>'local_area_id')::uuid AND destination_id=(actual->>'destination_id')::uuid
    ) THEN RAISE EXCEPTION 'Local area conflict'; END IF;
    IF EXISTS (SELECT 1 FROM native_private.review_bindings WHERE source_key=key AND manifest IS DISTINCT FROM choice) THEN
      RAISE EXCEPTION 'Permanent binding conflict';
    END IF;
    INSERT INTO native_private.review_bindings(source_key,spot_id,manifest)
    VALUES(key,mapped_spot_id,choice) ON CONFLICT(source_key) DO NOTHING;
  END LOOP;
  INSERT INTO native_private.receipts(batch_hash,accepted) VALUES(p_hash,count_rows);
  RETURN jsonb_build_object('accepted',count_rows,'repeated',false,'publicationReady',false);
END;
$$;
REVOKE ALL ON FUNCTION native_private.assert_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION native_private.assert_schema() TO service_role;
REVOKE ALL ON FUNCTION public.native_production_ingest(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.native_production_ingest(text,text,text,text) TO service_role;
COMMIT;
