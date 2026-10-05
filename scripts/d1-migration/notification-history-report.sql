-- Run only in the verified Localley source project llehrhqeolfprutcaopi.
-- Paste the whole file into SQL Editor; retain the single report privately.
-- No migration, function installation, history disposition or activation.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL search_path = pg_catalog;

WITH actor AS (
  SELECT rolsuper OR rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname=current_user
), targets(name) AS (
  VALUES ('notifications'), ('notification_preferences'), ('push_subscriptions')
), relations AS (
  SELECT t.name, c.oid, c.relkind, c.relrowsecurity,
    (NOT c.relrowsecurity OR (SELECT bypass_rls FROM actor) OR
      (pg_has_role(c.relowner,'USAGE') AND NOT c.relforcerowsecurity)) AS full_count_visibility,
    EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='clerk_user_id'
      AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid IN (25,1043,2950)) AS owner_column,
    EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='push_enabled'
      AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid=16) AS push_column,
    EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='email_enabled'
      AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid=16) AS email_column
  FROM targets t LEFT JOIN pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.name
), users_lookup AS (
  SELECT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname='users'
    AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity OR (SELECT bypass_rls FROM actor)
      OR (pg_has_role(c.relowner,'USAGE') AND NOT c.relforcerowsecurity)) AND a.attname='clerk_id' AND a.attnum>0 AND NOT a.attisdropped
    AND a.atttypid IN (25,1043,2950)) AS available
), table_reports AS (
  SELECT r.name, jsonb_build_object(
    'table',r.name,'physical_state',CASE WHEN r.oid IS NULL THEN 'absent'
      WHEN r.relkind IN ('r','p') THEN 'table' ELSE 'unsupported_relation' END,
    'relation_kind',r.relkind,'rls_enabled',r.relrowsecurity,
    'full_count_visibility',r.full_count_visibility,'owner_column_supported',r.owner_column,'users_lookup_supported',u.available,
    'push_boolean_supported',r.push_column,'email_boolean_supported',r.email_column,
    'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,
      'has_default',a.atthasdef) ORDER BY a.attnum) FROM pg_attribute a
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
    'counts',NULLIF(x.report,'')::jsonb,
    'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,
      'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,
      'using_hash',md5(COALESCE(p.polqual::text,'')),
      'check_hash',md5(COALESCE(p.polwithcheck::text,''))) ORDER BY p.polname)
      FROM pg_policy p WHERE p.polrelid=r.oid),'[]'::jsonb)
  ) AS report
  FROM relations r CROSS JOIN users_lookup u
  CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING
    CASE WHEN r.relkind IN ('r','p') AND r.full_count_visibility THEN query_to_xml(format(
      'SELECT jsonb_build_object(''rows'',count(*),''distinct_owners'',%s,
        ''missing_owners'',%s,''matched_user_rows'',%s,''unmatched_user_rows'',%s,
        ''push_true'',%s,''push_false'',%s,''push_null'',%s,
        ''email_true'',%s,''email_false'',%s,''email_null'',%s) AS report FROM public.%I t',
      CASE WHEN r.owner_column THEN 'count(DISTINCT t.clerk_user_id::text)' ELSE 'NULL' END,
      CASE WHEN r.owner_column THEN 'count(*) FILTER (WHERE t.clerk_user_id IS NULL OR btrim(t.clerk_user_id::text)='''')' ELSE 'NULL' END,
      CASE WHEN r.owner_column AND u.available THEN 'count(*) FILTER (WHERE EXISTS (SELECT FROM public.users u WHERE u.clerk_id::text=t.clerk_user_id::text))' ELSE 'NULL' END,
      CASE WHEN r.owner_column AND u.available THEN 'count(*) FILTER (WHERE t.clerk_user_id IS NOT NULL AND btrim(t.clerk_user_id::text)<>'''' AND NOT EXISTS (SELECT FROM public.users u WHERE u.clerk_id::text=t.clerk_user_id::text))' ELSE 'NULL' END,
      CASE WHEN r.push_column THEN 'count(*) FILTER (WHERE t.push_enabled IS TRUE)' ELSE 'NULL' END,
      CASE WHEN r.push_column THEN 'count(*) FILTER (WHERE t.push_enabled IS FALSE)' ELSE 'NULL' END,
      CASE WHEN r.push_column THEN 'count(*) FILTER (WHERE t.push_enabled IS NULL)' ELSE 'NULL' END,
      CASE WHEN r.email_column THEN 'count(*) FILTER (WHERE t.email_enabled IS TRUE)' ELSE 'NULL' END,
      CASE WHEN r.email_column THEN 'count(*) FILTER (WHERE t.email_enabled IS FALSE)' ELSE 'NULL' END,
      CASE WHEN r.email_column THEN 'count(*) FILTER (WHERE t.email_enabled IS NULL)' ELSE 'NULL' END,
      r.name),true,false,'')
    ELSE query_to_xml('SELECT NULL::jsonb AS report',true,false,'') END
    COLUMNS report text PATH 'report') x
), relevant_functions AS (
  SELECT p.oid,n.nspname,p.proname,p.prosecdef,p.prokind,
    md5(pg_get_functiondef(p.oid)) AS definition_hash
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind IN ('f','p')
    AND (p.proname ILIKE '%notif%' OR CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE '' END
      ~* '(notifications|notification_preferences|push_subscriptions)')
), relevant_triggers AS (
  SELECT t.tgname,t.tgenabled,t.tgtype,n.nspname,c.relname,p.proname,
    md5(pg_get_triggerdef(t.oid)) AS definition_hash
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND ((n.nspname='public' AND c.relname IN
    ('users','notifications','notification_preferences','push_subscriptions'))
    OR t.tgfoid IN (SELECT oid FROM relevant_functions))
)
SELECT jsonb_build_object(
  'report_version',1,'checked_at',transaction_timestamp(),'database',current_database(),
  'server_version',current_setting('server_version'),'expected_project_ref','llehrhqeolfprutcaopi',
  'project_identity_verified',false,'sql_role',current_user,'role_bypasses_rls',(SELECT bypass_rls FROM actor),'read_only',current_setting('transaction_read_only'),
  'snapshot',current_setting('transaction_isolation'),
  'tables',(SELECT jsonb_agg(report ORDER BY name) FROM table_reports),
  'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',nspname,'name',proname,
    'oid',oid,'kind',prokind,'security_definer',prosecdef,'definition_hash',definition_hash)
    ORDER BY nspname,proname,oid) FROM relevant_functions),'[]'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',nspname,'table',relname,
    'name',tgname,'enabled',tgenabled,'type',tgtype,'function',proname,'definition_hash',definition_hash)
    ORDER BY nspname,relname,tgname) FROM relevant_triggers),'[]'::jsonb),
  'external_writers_audited',false,'historical_consent_proven',false,'activation_ready',false,
  'limits',jsonb_build_array('Verify the project selector or connection before running; the literal project ref is not proof.',
    'Counts and exact clerk-ID equality do not prove authentication ownership, historical opt-in or row-value parity.',
    'Stored boolean consent counts do not establish how consent was obtained.',
    'Function text matching and attached trigger metadata do not exhaust dynamic SQL, cron or external writers.',
    'Absent columns, unsupported relations, RLS-restricted counts and unavailable user lookup yield null counts, never invented zeros.',
    'Timeout or permission failure is incomplete evidence; do not create tables or enable delivery.')) AS notification_history_report;
ROLLBACK;
