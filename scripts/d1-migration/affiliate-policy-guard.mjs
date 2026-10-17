// One guarded transaction; no table data, grants, functions or migration ledger changes.
// Restore reopens the previous exposure. It is for reviewed emergency use, never automatic retry.
export function affiliatePolicySql(direction = 'restrict') {
  if (!['restrict', 'restore'].includes(direction)) throw new Error('invalid_policy_direction');
  const previous = direction === 'restrict' ? 'ARRAY[0::oid]' : 'ARRAY[service_oid]';
  const next = direction === 'restrict' ? 'service_role' : 'PUBLIC';
  return `BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5s';
LOCK TABLE public.affiliate_clicks, public.affiliate_earnings IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE service_oid oid; actual record; expected record; before_rows text; after_rows text;
BEGIN
  SELECT oid INTO STRICT service_oid FROM pg_catalog.pg_roles WHERE rolname='service_role' AND rolbypassrls;
  IF pg_catalog.pg_has_role('anon',service_oid,'MEMBER') OR pg_catalog.pg_has_role('authenticated',service_oid,'MEMBER') THEN
    RAISE EXCEPTION 'affiliate_guard_public_role_membership';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class WHERE oid IN ('public.affiliate_clicks'::regclass,'public.affiliate_earnings'::regclass)
      AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity) <> 2 THEN
    RAISE EXCEPTION 'affiliate_guard_relation_state';
  END IF;
  IF NOT pg_catalog.has_table_privilege('service_role','public.affiliate_clicks','SELECT')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_clicks','INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_clicks','UPDATE')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_clicks','DELETE')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_earnings','SELECT')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_earnings','INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_earnings','UPDATE')
     OR NOT pg_catalog.has_table_privilege('service_role','public.affiliate_earnings','DELETE') THEN
    RAISE EXCEPTION 'affiliate_guard_server_privileges';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid IN ('public.affiliate_clicks'::regclass,'public.affiliate_earnings'::regclass)) <> 4 THEN
    RAISE EXCEPTION 'affiliate_guard_policy_count';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('affiliate_clicks','Allow affiliate click inserts','a',NULL::text,'true',true),
    ('affiliate_clicks','Allow affiliate click reads','r','true',NULL::text,true),
    ('affiliate_earnings','Allow earnings access','*','true',NULL::text,true),
    ('affiliate_earnings','Admin only for earnings','*','false',NULL::text,false)
  ) v(tab,policy,command,using_expr,check_expr,changes)
  LOOP
    SELECT p.polcmd::text AS command,p.polpermissive,p.polroles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expr,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr INTO STRICT actual
    FROM pg_catalog.pg_policy p WHERE p.polrelid=pg_catalog.to_regclass('public.'||expected.tab) AND p.polname=expected.policy;
    IF actual.command IS DISTINCT FROM expected.command OR NOT actual.polpermissive
       OR actual.using_expr IS DISTINCT FROM expected.using_expr OR actual.check_expr IS DISTINCT FROM expected.check_expr
       OR actual.polroles IS DISTINCT FROM (CASE WHEN expected.changes THEN ${previous} ELSE ARRAY[0::oid] END) THEN
      RAISE EXCEPTION 'affiliate_guard_policy_mismatch';
    END IF;
  END LOOP;
  SELECT pg_catalog.md5(COALESCE((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY to_jsonb(c)::text) FROM public.affiliate_clicks c),'')||'|'||
    COALESCE((SELECT string_agg(to_jsonb(e)::text,'' ORDER BY to_jsonb(e)::text) FROM public.affiliate_earnings e),'')) INTO before_rows;
  ALTER POLICY "Allow affiliate click inserts" ON public.affiliate_clicks TO ${next};
  ALTER POLICY "Allow affiliate click reads" ON public.affiliate_clicks TO ${next};
  ALTER POLICY "Allow earnings access" ON public.affiliate_earnings TO ${next};
  SELECT pg_catalog.md5(COALESCE((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY to_jsonb(c)::text) FROM public.affiliate_clicks c),'')||'|'||
    COALESCE((SELECT string_agg(to_jsonb(e)::text,'' ORDER BY to_jsonb(e)::text) FROM public.affiliate_earnings e),'')) INTO after_rows;
  IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'affiliate_guard_rows_changed'; END IF;
END $guard$;
COMMIT;`;
}
