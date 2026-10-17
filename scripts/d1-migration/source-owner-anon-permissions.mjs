// Guarded permission containment only. No row, policy, function, provider or identity changes.
import { publicCatalogs, publicColumns } from './anonymous-read-regression.mjs';
const allRelations = `SELECT c.oid,c.relname,c.relrowsecurity,c.relkind,c.relowner,c.relacl, EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') AS extension_owned FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f')`;
export const anonymousPermissionCatalogSql = `SELECT md5(jsonb_build_object('relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.relname) FROM (${allRelations}) c),
 'roles',(SELECT jsonb_agg(jsonb_build_object('oid',oid,'super',rolsuper,'bypass',rolbypassrls,'inherit',rolinherit) ORDER BY oid) FROM pg_catalog.pg_roles),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_catalog.pg_auth_members m))::text) AS catalog_md5`;
export function anonymousPermissionSql({ expectedCatalogMd5, expectedRelations, includeExtensionOwned = false } = {}) {
  if(typeof includeExtensionOwned!=='boolean')throw Error('invalid_extension_permission_scope');
  const relations=includeExtensionOwned?allRelations:`SELECT * FROM (${allRelations}) c WHERE NOT extension_owned`;
  expectedRelations ??= includeExtensionOwned?51:48;
  if(!/^[a-f0-9]{32}$/.test(expectedCatalogMd5??'') || !Number.isSafeInteger(expectedRelations) || expectedRelations<1 || expectedRelations>200)throw Error('invalid_anonymous_permission_precondition');
  const projections=publicCatalogs.map(t=>`('${t}',ARRAY[${publicColumns[t].map(c=>`'${c}'`).join(',')}]::text[])`).join(',');
  return `BEGIN;
SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s';
DO $anon$
DECLARE r record; proj record; cols text; observed text; before_rows text; after_rows text;
 before_policy text; after_policy text; before_server text; after_server text; aggregate_rows text:=''; aggregate_server text:=''; h text; bad boolean;
BEGIN
 IF (SELECT count(*) FROM (${relations}) c)<>${expectedRelations} OR EXISTS(SELECT 1 FROM (${relations}) c WHERE NOT c.extension_owned AND (c.relkind<>'r' OR NOT c.relrowsecurity)) THEN RAISE EXCEPTION 'anon_guard_relation_state';END IF;
 IF EXISTS(SELECT 1 FROM (${relations}) c WHERE c.extension_owned AND c.relkind NOT IN('r','v')) THEN RAISE EXCEPTION 'anon_guard_extension_kind';END IF;
 IF EXISTS(SELECT 1 FROM (${relations}) c WHERE pg_catalog.row_security_active(c.oid)) THEN RAISE EXCEPTION 'anon_guard_limited_visibility';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon' AND (rolsuper OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM (${relations}) c WHERE pg_has_role('anon',c.relowner,'MEMBER')) THEN RAISE EXCEPTION 'anon_guard_role_bypass';END IF;
 FOR r IN SELECT * FROM (${relations}) c WHERE c.relkind='r' ORDER BY c.relname LOOP EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',r.relname);END LOOP;
 SELECT catalog_md5 INTO observed FROM (${anonymousPermissionCatalogSql}) q;
 IF observed IS DISTINCT FROM '${expectedCatalogMd5}' THEN RAISE EXCEPTION 'anon_guard_catalog_drift';END IF;
 FOR r IN ${relations} ORDER BY c.relname LOOP
  IF r.relkind='r' THEN
  EXECUTE format('SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'''' ORDER BY md5(to_jsonb(x)::text)),'''')) FROM public.%I x',r.relname) INTO h;
  aggregate_rows:=aggregate_rows||r.relname||h;
  END IF;
  SELECT md5(jsonb_agg(jsonb_build_object('role',v.role,'column',a.attname,'select',has_column_privilege(v.role,r.oid,a.attnum,'SELECT'),'insert',has_column_privilege(v.role,r.oid,a.attnum,'INSERT'),'update',has_column_privilege(v.role,r.oid,a.attnum,'UPDATE'),'delete',has_table_privilege(v.role,r.oid,'DELETE'),'truncate',has_table_privilege(v.role,r.oid,'TRUNCATE')) ORDER BY v.role,a.attnum)::text) INTO h FROM pg_attribute a CROSS JOIN(VALUES('authenticated'),('service_role')) v(role) WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped;
  aggregate_server:=aggregate_server||r.relname||h;
 END LOOP;
 SELECT md5(jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.relname)::text) INTO before_policy FROM (${relations}) c;
 before_rows:=md5(aggregate_rows);before_server:=md5(aggregate_server);
 FOR r IN ${relations} ORDER BY c.relname LOOP
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=r.oid AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM anon',r.relname);
  IF r.relkind IN('r','p') THEN EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon',r.relname);END IF;
  EXECUTE format('REVOKE INSERT(%s),UPDATE(%s) ON public.%I FROM anon',cols,cols,r.relname);
  IF NOT r.extension_owned AND NOT r.relname=ANY(ARRAY[${publicCatalogs.map(t=>`'${t}'`).join(',')}]::text[]) THEN
   EXECUTE format('REVOKE SELECT ON public.%I FROM anon',r.relname);
   EXECUTE format('REVOKE SELECT(%s) ON public.%I FROM anon',cols,r.relname);
   IF has_table_privilege('anon',r.oid,'SELECT') OR has_any_column_privilege('anon',r.oid,'SELECT') THEN RAISE EXCEPTION 'anon_guard_residual_private_select';END IF;
  END IF;
  IF has_table_privilege('anon',r.oid,'INSERT') OR has_any_column_privilege('anon',r.oid,'INSERT') OR has_table_privilege('anon',r.oid,'UPDATE') OR has_any_column_privilege('anon',r.oid,'UPDATE') OR has_table_privilege('anon',r.oid,'DELETE') OR (r.relkind IN('r','p') AND has_table_privilege('anon',r.oid,'TRUNCATE')) THEN RAISE EXCEPTION 'anon_guard_inherited_mutation_grant';END IF;
 END LOOP;
 FOR proj IN SELECT * FROM(VALUES ${projections}) v(name,columns) LOOP
  SELECT * INTO STRICT r FROM (${relations}) c WHERE c.relname=proj.name;
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=r.oid AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT ON public.%I FROM anon',r.relname);
  EXECUTE format('REVOKE SELECT(%s) ON public.%I FROM anon',cols,r.relname);
  SELECT string_agg(format('%I',v),',') INTO cols FROM unnest(proj.columns) v;
  EXECUTE format('GRANT SELECT(%s) ON public.%I TO anon',cols,r.relname);
  SELECT bool_or(has_column_privilege('anon',r.oid,a.attnum,'SELECT') IS DISTINCT FROM (a.attname=ANY(proj.columns))) INTO bad FROM pg_attribute a WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped;
  IF bad THEN RAISE EXCEPTION 'anon_guard_inherited_select_grant';END IF;
 END LOOP;
 aggregate_rows:='';aggregate_server:='';
 FOR r IN ${relations} ORDER BY c.relname LOOP
  IF r.relkind='r' THEN
  EXECUTE format('SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'''' ORDER BY md5(to_jsonb(x)::text)),'''')) FROM public.%I x',r.relname) INTO h;
  aggregate_rows:=aggregate_rows||r.relname||h;
  END IF;
  SELECT md5(jsonb_agg(jsonb_build_object('role',v.role,'column',a.attname,'select',has_column_privilege(v.role,r.oid,a.attnum,'SELECT'),'insert',has_column_privilege(v.role,r.oid,a.attnum,'INSERT'),'update',has_column_privilege(v.role,r.oid,a.attnum,'UPDATE'),'delete',has_table_privilege(v.role,r.oid,'DELETE'),'truncate',has_table_privilege(v.role,r.oid,'TRUNCATE')) ORDER BY v.role,a.attnum)::text) INTO h FROM pg_attribute a CROSS JOIN(VALUES('authenticated'),('service_role')) v(role) WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped;
  aggregate_server:=aggregate_server||r.relname||h;
 END LOOP;
 SELECT md5(jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.relname)::text) INTO after_policy FROM (${relations}) c;
 after_rows:=md5(aggregate_rows);after_server:=md5(aggregate_server);
 IF before_policy IS DISTINCT FROM after_policy THEN RAISE EXCEPTION 'anon_guard_policy_change';END IF;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'anon_guard_row_change';END IF;
 IF before_server IS DISTINCT FROM after_server THEN RAISE EXCEPTION 'anon_guard_server_privilege_change';END IF;
END $anon$;
COMMIT;`;
}
