// One-table security repair. No data, column, function, identity or migration-ledger change.
const table = "'public.saved_itineraries'::regclass";
const owner = "clerk_user_id = (SELECT auth.jwt() ->> 'sub')";
const canonicalOwner = "(clerk_user_id = ( SELECT (auth.jwt() ->> 'sub'::text)))";
const literal = value => value === null ? 'NULL::text' : "'" + value.replaceAll("'", "''") + "'";
export const savedPolicies = [
  {name:'Users can save itineraries',command:'a',using:null,check:'true'},
  {name:'Users can unsave itineraries',command:'d',using:'true',check:null},
  {name:'Users can view saved itineraries',command:'r',using:'true',check:null},
];
export const savedCatalogSql = `SELECT md5(jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl,
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,
 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
 FROM pg_policy p WHERE p.polrelid=c.oid))::text) AS catalog_md5 FROM pg_class c WHERE c.oid=${table}`;
export function savedPolicySql({restoreCatalogMd5}={}) {
  const restore=restoreCatalogMd5!==undefined;
  if(restore&&!/^[a-f0-9]{32}$/.test(restoreCatalogMd5))throw Error('invalid_saved_restore_fingerprint');
  const changes=savedPolicies.map(p=>`ALTER POLICY "${p.name}" ON public.saved_itineraries TO ${restore?'PUBLIC':'authenticated'}${p.using?` USING (${restore?'true':owner})`:''}${p.check?` WITH CHECK (${restore?'true':owner})`:''};`).join('\n');
  const fingerprint="SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) FROM public.saved_itineraries x";
  return `BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s';
LOCK TABLE public.saved_itineraries IN ACCESS EXCLUSIVE MODE;
DO $saved$
DECLARE auth_oid oid; actual record; expected record; r record; before_rows text; after_rows text; observed_catalog text;
BEGIN
 SELECT oid INTO STRICT auth_oid FROM pg_roles WHERE rolname='authenticated';
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'saved_guard_server_role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=${table} AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'saved_guard_relation'; END IF;
 FOR r IN SELECT p.oid,p.rolname,p.rolbypassrls,p.rolsuper,c.relowner FROM pg_roles p CROSS JOIN pg_class c WHERE p.rolname IN('anon','authenticated') AND c.oid=${table} LOOP
  IF r.rolbypassrls OR r.rolsuper OR pg_has_role(r.oid,r.relowner,'MEMBER') OR pg_has_role(r.oid,'service_role','MEMBER') THEN RAISE EXCEPTION 'saved_guard_public_bypass'; END IF;
 END LOOP;
 IF NOT(has_table_privilege('service_role',${table},'SELECT') AND has_table_privilege('service_role',${table},'INSERT') AND has_table_privilege('service_role',${table},'UPDATE') AND has_table_privilege('service_role',${table},'DELETE')) THEN RAISE EXCEPTION 'saved_guard_server_acl'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polrelid=${table})<>3 THEN RAISE EXCEPTION 'saved_guard_policy_count'; END IF;
 ${restore?`SELECT catalog_md5 INTO observed_catalog FROM (${savedCatalogSql}) q; IF observed_catalog IS DISTINCT FROM '${restoreCatalogMd5}' THEN RAISE EXCEPTION 'saved_guard_restore_drift'; END IF;`:''}
 FOR expected IN SELECT * FROM(VALUES ${savedPolicies.map(p=>`(${literal(p.name)},${literal(p.command)},${literal(restore&&p.using?canonicalOwner:p.using)},${literal(restore&&p.check?canonicalOwner:p.check)})`).join(',')}) v(name,command,using_expr,check_expr) LOOP
  SELECT p.polcmd::text AS command,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr INTO STRICT actual FROM pg_policy p WHERE p.polrelid=${table} AND p.polname=expected.name;
  IF actual.command IS DISTINCT FROM expected.command OR NOT actual.polpermissive OR actual.polroles IS DISTINCT FROM ${restore?'ARRAY[auth_oid]':'ARRAY[0::oid]'}
   OR regexp_replace(actual.using_expr,'[[:space:]]+','','g') IS DISTINCT FROM regexp_replace(expected.using_expr,'[[:space:]]+','','g')
   OR regexp_replace(actual.check_expr,'[[:space:]]+','','g') IS DISTINCT FROM regexp_replace(expected.check_expr,'[[:space:]]+','','g') THEN RAISE EXCEPTION 'saved_guard_policy_mismatch'; END IF;
 END LOOP;
 ${restore?'':`IF NOT has_table_privilege('anon',${table},'TRUNCATE') OR NOT has_table_privilege('authenticated',${table},'TRUNCATE') THEN RAISE EXCEPTION 'saved_guard_initial_truncate'; END IF;
 IF (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles g ON g.oid=a.grantee JOIN pg_roles grantor ON grantor.oid=a.grantor WHERE c.oid=${table} AND g.rolname IN('anon','authenticated') AND a.privilege_type='TRUNCATE' AND NOT a.is_grantable AND grantor.rolname=current_user)<>2 THEN RAISE EXCEPTION 'saved_guard_exact_truncate_grantors'; END IF;`}
 ${fingerprint.replace(' FROM public.', ' INTO before_rows FROM public.')};
 ${changes}
 ${restore?'GRANT':'REVOKE'} TRUNCATE ON public.saved_itineraries ${restore?'TO':'FROM'} anon,authenticated;
 ${restore?'':`IF has_table_privilege('anon',${table},'TRUNCATE') OR has_table_privilege('authenticated',${table},'TRUNCATE') THEN RAISE EXCEPTION 'saved_guard_inherited_truncate'; END IF;`}
 ${fingerprint.replace(' FROM public.', ' INTO after_rows FROM public.')};
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'saved_guard_rows_changed'; END IF;
END $saved$;
COMMIT;`;
}
