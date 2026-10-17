// Source-only security repair. No user records, billing, secrets or D1 routing changes.
export const ownerTables = ['challenges','conversations','itineraries','messages','spots','user_challenges','user_progress','users'];
export const truncateTables = [...ownerTables,'affiliate_clicks','affiliate_earnings'].sort();
const subject = "(SELECT auth.jwt() ->> 'sub')";
const owner = column => `${column} = ${subject}`;
const ownUser = `user_id IN (SELECT id FROM public.users WHERE clerk_id = ${subject})`;
const ownConversation = `EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.clerk_user_id = ${subject})`;
export const ownerPolicies = [
  { table:'users', name:'Localley own profile', role:'authenticated', using:owner('clerk_id'), check:owner('clerk_id') },
  { table:'user_progress', name:'Localley own progress', role:'authenticated', using:ownUser, check:ownUser },
  { table:'user_challenges', name:'Localley own challenges', role:'authenticated', using:ownUser, check:ownUser },
  { table:'itineraries', name:'Localley own itinerary', role:'authenticated', using:owner('clerk_user_id'),
    check:`${owner('clerk_user_id')} AND (user_id IS NULL OR ${ownUser})` },
  { table:'conversations', name:'Localley own conversation', role:'authenticated', using:owner('clerk_user_id'),
    check:`${owner('clerk_user_id')} AND (linked_itinerary_id IS NULL OR EXISTS (SELECT 1 FROM public.itineraries i WHERE i.id=conversations.linked_itinerary_id AND i.clerk_user_id=${subject}))` },
  { table:'messages', name:'Localley own message', role:'authenticated', using:ownConversation, check:ownConversation },
  { table:'itineraries', name:'Localley published itinerary read', role:'authenticated', using:'is_public IS TRUE', command:'SELECT' },
  { table:'spots', name:'Localley public spot read', role:'anon, authenticated', using:'true', command:'SELECT' },
  { table:'challenges', name:'Localley public challenge read', role:'anon, authenticated', using:'true', command:'SELECT' },
];
// Include roles, expressions, RLS flags and all ACLs in the emergency rollback fingerprint.
export const ownerCatalogSql = `SELECT md5(jsonb_build_object('tables',
  (SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl) ORDER BY c.relname)
   FROM pg_class c WHERE c.oid IN(${truncateTables.map(t=>`'public.${t}'::regclass`).join(',')})),
  'policies',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,'command',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY c.relname,p.polname)
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.oid IN(${truncateTables.map(t=>`'public.${t}'::regclass`).join(',')})))::text) AS catalog_md5`;
export function sourceOwnerPolicySql({ restoreCatalogMd5 } = {}) {
  const restore = restoreCatalogMd5 !== undefined;
  if (restore && !/^[a-f0-9]{32}$/.test(restoreCatalogMd5)) throw Error('invalid_restore_catalog_fingerprint');
  const tables = ownerTables.map(t=>`'public.${t}'::regclass`).join(',');
  const changes = restore
    ? ownerPolicies.map(p=>`DROP POLICY "${p.name}" ON public.${p.table};`).join('\n')+'\n'+ownerTables.map(t=>`ALTER TABLE public.${t} DISABLE ROW LEVEL SECURITY;`).join('\n')+`\nGRANT TRUNCATE ON ${truncateTables.map(t=>'public.'+t).join(',')} TO anon,authenticated;`
    : ownerPolicies.map(p=>`CREATE POLICY "${p.name}" ON public.${p.table} FOR ${p.command??'ALL'} TO ${p.role} USING (${p.using})${p.check?` WITH CHECK (${p.check})`:''};`).join('\n')+'\n'+ownerTables.map(t=>`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`).join('\n')+`\nREVOKE TRUNCATE ON ${truncateTables.map(t=>'public.'+t).join(',')} FROM anon,authenticated;`;
  return `BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s';
LOCK TABLE ${truncateTables.map(t=>'public.'+t).join(',')} IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE before_rows text; after_rows text; t text; r record; observed_catalog_md5 text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'owner_guard_server_role'; END IF;
  FOR r IN SELECT p.oid,p.rolname,p.rolbypassrls,p.rolsuper,c.relowner FROM pg_roles p CROSS JOIN pg_class c
    WHERE p.rolname IN('anon','authenticated') AND c.oid IN(${tables})
  LOOP
    IF r.rolbypassrls OR r.rolsuper OR pg_has_role(r.oid,r.relowner,'MEMBER') OR pg_has_role(r.oid,'service_role','MEMBER') THEN RAISE EXCEPTION 'owner_guard_public_bypass'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_class WHERE oid IN(${tables}) AND relkind='r' AND NOT relforcerowsecurity AND relrowsecurity=${restore?'true':'false'})<>8 THEN RAISE EXCEPTION 'owner_guard_relation_state'; END IF;
  ${restore?`SELECT catalog_md5 INTO observed_catalog_md5 FROM (${ownerCatalogSql}) s;
  IF observed_catalog_md5 IS DISTINCT FROM '${restoreCatalogMd5}' THEN RAISE EXCEPTION 'owner_guard_rollback_catalog_drift'; END IF;`:`IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN(${tables})) THEN RAISE EXCEPTION 'owner_guard_existing_policy'; END IF;
  IF EXISTS(SELECT 1 FROM public.itineraries WHERE clerk_user_id IS NULL OR btrim(clerk_user_id)='')
     OR EXISTS(SELECT 1 FROM public.itineraries i JOIN public.users u ON u.id=i.user_id WHERE u.clerk_id IS DISTINCT FROM i.clerk_user_id)
     OR EXISTS(SELECT 1 FROM public.conversations c JOIN public.itineraries i ON i.id=c.linked_itinerary_id WHERE i.clerk_user_id IS DISTINCT FROM c.clerk_user_id) THEN RAISE EXCEPTION 'owner_guard_historical_owner_conflict'; END IF;`}
  FOREACH t IN ARRAY ARRAY[${truncateTables.map(t=>`'${t}'`).join(',')}] LOOP
    IF NOT (has_table_privilege('service_role','public.'||t,'SELECT') AND has_table_privilege('service_role','public.'||t,'INSERT') AND has_table_privilege('service_role','public.'||t,'UPDATE') AND has_table_privilege('service_role','public.'||t,'DELETE')) THEN RAISE EXCEPTION 'owner_guard_server_acl'; END IF;
  END LOOP;
  ${restore?'':`FOREACH t IN ARRAY ARRAY[${truncateTables.map(t=>`'${t}'`).join(',')}] LOOP IF NOT has_table_privilege('anon','public.'||t,'TRUNCATE') OR NOT has_table_privilege('authenticated','public.'||t,'TRUNCATE') THEN RAISE EXCEPTION 'owner_guard_initial_truncate_drift'; END IF; END LOOP;`}
  -- Sort fixed-width row digests, not full photo/source JSON. Keep the eight-second lock window.
  SELECT md5(string_agg(v.h,'|' ORDER BY v.tab)) INTO before_rows FROM (${truncateTables.map(t=>`SELECT '${t}' AS tab,md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) AS h FROM public.${t} x`).join(' UNION ALL ')}) v;
  ${changes}
  ${restore?'':`FOREACH t IN ARRAY ARRAY[${truncateTables.map(t=>`'${t}'`).join(',')}] LOOP
    IF has_table_privilege('anon','public.'||t,'TRUNCATE') OR has_table_privilege('authenticated','public.'||t,'TRUNCATE') THEN RAISE EXCEPTION 'owner_guard_inherited_truncate'; END IF;
  END LOOP;`}
  SELECT md5(string_agg(v.h,'|' ORDER BY v.tab)) INTO after_rows FROM (${truncateTables.map(t=>`SELECT '${t}' AS tab,md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) AS h FROM public.${t} x`).join(' UNION ALL ')}) v;
  IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'owner_guard_rows_changed'; END IF;
END $guard$;
COMMIT;`;
}
