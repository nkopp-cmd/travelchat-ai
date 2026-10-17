-- Localley source llehrhqeolfprutcaopi only. One SELECT, no mutation or RPC invocation.
-- Use the Management API /database/query/read-only endpoint and retain the report privately.
WITH relations AS (
  SELECT c.oid,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('affiliate_clicks','affiliate_earnings')
), relation_reports AS (
  SELECT pg_catalog.jsonb_build_object(
    'name',r.relname,'kind',r.relkind,'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
    'row_security_active',pg_catalog.row_security_active(r.oid),
    'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.attname,
      'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',c.conname,
      'type',c.contype,'validated',c.convalidated,'definition',pg_catalog.pg_get_constraintdef(c.oid)) ORDER BY c.conname)
      FROM pg_catalog.pg_constraint c WHERE c.conrelid=r.oid),
    'indexes',(SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid)
      FROM pg_catalog.pg_index i WHERE i.indrelid=r.oid),
    'policies',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',p.polname,'command',p.polcmd,
      'permissive',p.polpermissive,'roles',p.polroles,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),
      'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
      FROM pg_catalog.pg_policy p WHERE p.polrelid=r.oid),
    'privileges',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',v.role_name,
      'select',pg_catalog.has_table_privilege(v.role_name,r.oid,'SELECT'),
      'insert',pg_catalog.has_table_privilege(v.role_name,r.oid,'INSERT'),
      'update',pg_catalog.has_table_privilege(v.role_name,r.oid,'UPDATE'),
      'delete',pg_catalog.has_table_privilege(v.role_name,r.oid,'DELETE')) ORDER BY v.role_name)
      FROM (VALUES('anon'),('authenticated'),('service_role'))v(role_name)),
    'triggers',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',t.tgname,
      'enabled',t.tgenabled,'definition',pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
      FROM pg_catalog.pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal)
  ) AS report FROM relations r
), clicks AS (
  SELECT pg_catalog.jsonb_build_object('table','affiliate_clicks','rows',pg_catalog.count(*),
    'hash',pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(t)::text,'' ORDER BY pg_catalog.to_jsonb(t)::text),'')),
    'anonymous_rows',pg_catalog.count(*) FILTER(WHERE clerk_user_id IS NULL),
    'nonempty_owner_rows',pg_catalog.count(*) FILTER(WHERE clerk_user_id IS NOT NULL AND pg_catalog.btrim(clerk_user_id)<>''),
    'missing_tracking_id',pg_catalog.count(*) FILTER(WHERE tracking_id IS NULL OR pg_catalog.btrim(tracking_id)=''),
    'invalid_partner',pg_catalog.count(*) FILTER(WHERE partner IS NULL OR partner NOT IN('viator','booking','getyourguide','klook')),
    'invalid_event',pg_catalog.count(*) FILTER(WHERE event_type IS NULL OR event_type NOT IN('view','click','conversion')),
    'views',pg_catalog.count(*) FILTER(WHERE event_type='view'),
    'clicks',pg_catalog.count(*) FILTER(WHERE event_type='click'),
    'conversions',pg_catalog.count(*) FILTER(WHERE event_type='conversion'),
    'with_conversion_value',pg_catalog.count(*) FILTER(WHERE conversion_value IS NOT NULL),
    'with_commission_earned',pg_catalog.count(*) FILTER(WHERE commission_earned IS NOT NULL),
    'with_user_agent',pg_catalog.count(*) FILTER(WHERE user_agent IS NOT NULL),
    'with_ip_hash',pg_catalog.count(*) FILTER(WHERE ip_hash IS NOT NULL),
    'first_created',pg_catalog.min(created_at),'last_created',pg_catalog.max(created_at)) AS report
  FROM public.affiliate_clicks t
), earnings AS (
  SELECT pg_catalog.jsonb_build_object('table','affiliate_earnings','rows',pg_catalog.count(*),
    'hash',pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(t)::text,'' ORDER BY pg_catalog.to_jsonb(t)::text),'')),
    'first_period',pg_catalog.min(period_date),'last_period',pg_catalog.max(period_date)) AS report
  FROM public.affiliate_earnings t
), aggregate_function AS (
  SELECT pg_catalog.jsonb_build_object('name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
    'security_definer',p.prosecdef,'definition_hash',pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
    'execute_anon',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
    'execute_authenticated',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'execute_service_role',pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) AS report
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='aggregate_affiliate_stats' AND p.prokind='f'
)
SELECT pg_catalog.jsonb_build_object('read_only',pg_catalog.current_setting('transaction_read_only'),
  'timezone',pg_catalog.current_setting('TimeZone'),'role',CURRENT_USER,
  'relations',(SELECT pg_catalog.jsonb_agg(report ORDER BY report->>'name') FROM relation_reports),
  'snapshots',pg_catalog.jsonb_build_array((SELECT report FROM clicks),(SELECT report FROM earnings)),
  'aggregate_functions',(SELECT pg_catalog.jsonb_agg(report) FROM aggregate_function),
  'cron_job_catalog_present',pg_catalog.to_regclass('cron.job') IS NOT NULL) AS audit;
