/** Counts only. A missing/failed response is not evidence of zero anonymous rows. */
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = 'llehrhqeolfprutcaopi';
const origin = `https://${project}.supabase.co`;
// Nils2026-10-17: private tables must remain unreadable; retain these public catalogs.
// New relations are PRIVATE by default. Expanding this list requires a reviewed change.
export const publicCatalogs = Object.freeze([
  'challenges','geo_aliases','geo_countries','geo_destinations','geo_local_area_vibe_scores',
  'geo_local_areas','geo_vibe_taxonomy','spots','transfer_edges',
]);
// Column names, not row content. Opaque source metadata and owner identifiers are not public contracts.
export const publicColumns = Object.freeze(Object.fromEntries(Object.entries({
  "challenges": [
    "id",
    "name",
    "description",
    "city",
    "xp_reward",
    "requirements",
    "starts_at",
    "ends_at",
    "created_at"
  ],
  "geo_aliases": [
    "id",
    "entity_type",
    "destination_id",
    "local_area_id",
    "spot_id",
    "entity_id",
    "alias",
    "normalized_alias",
    "lang",
    "source",
    "created_at"
  ],
  "geo_countries": [
    "code",
    "name",
    "default_currency",
    "default_languages",
    "created_at",
    "updated_at"
  ],
  "geo_destinations": [
    "id",
    "slug",
    "name",
    "country_code",
    "center",
    "timezone",
    "currency",
    "languages",
    "ring",
    "is_enabled",
    "targets",
    "characterization",
    "reviewed_at",
    "created_at",
    "updated_at"
  ],
  "geo_local_area_vibe_scores": [
    "local_area_id",
    "vibe_id",
    "score",
    "confidence",
    "evidence",
    "source_type",
    "scored_at",
    "expires_at"
  ],
  "geo_local_areas": [
    "id",
    "destination_id",
    "parent_id",
    "kind",
    "slug",
    "name",
    "characterization",
    "traveler_types",
    "practical_notes",
    "center",
    "boundary",
    "confidence",
    "review_status",
    "reviewed_at",
    "created_at",
    "updated_at"
  ],
  "geo_vibe_taxonomy": [
    "id",
    "slug",
    "label",
    "version",
    "rubric",
    "created_at"
  ],
  "spots": [
    "id",
    "name",
    "description",
    "location",
    "address",
    "category",
    "subcategories",
    "localley_score",
    "local_percentage",
    "best_times",
    "photos",
    "tips",
    "verified",
    "trending_score",
    "created_at",
    "review_count",
    "average_rating",
    "name_en_normalized",
    "address_en_normalized",
    "google_place_id",
    "destination_id",
    "local_area_id"
  ],
  "transfer_edges": [
    "id",
    "slug",
    "from_destination_id",
    "to_destination_id",
    "mode",
    "duration_min_minutes",
    "duration_max_minutes",
    "departure_buffer_minutes",
    "arrival_buffer_minutes",
    "hotel_change_minutes",
    "cost_band",
    "booking_hint",
    "schedule_notes",
    "source_type",
    "confidence",
    "review_status",
    "reviewed_at",
    "valid_from",
    "valid_until",
    "created_at",
    "updated_at"
  ]
}).map(([name,columns]) => [name,Object.freeze(columns)])));
// Conservative proof: no DML privilege OR RLS with no potentially allowing permissive policy.
// Arbitrary SQL predicates/restrictive-policy combinations are not evaluated as "safe".
const blockedWriteSql = (command, privilege) => `NOT (
 (pg_catalog.has_table_privilege('anon',c.oid,'${privilege}')${command === 'd' ? '' : ` OR pg_catalog.has_any_column_privilege('anon',c.oid,'${privilege}')`})
 AND (NOT c.relrowsecurity OR c.relkind NOT IN('r','p')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname='anon' AND (r.rolsuper OR r.rolbypassrls))
 OR pg_catalog.pg_has_role('anon',c.relowner,'MEMBER')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive
 AND p.polcmd IN('*','${command}')
 AND EXISTS(SELECT 1 FROM unnest(p.polroles) role_oid WHERE role_oid=0 OR pg_catalog.pg_has_role('anon',role_oid,'MEMBER'))
 AND ${command === 'a' ? "COALESCE(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),pg_catalog.pg_get_expr(p.polqual,p.polrelid),'true') <> 'false'" : "COALESCE(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'true') <> 'false'"}
 ${command === 'w' ? "AND COALESCE(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),pg_catalog.pg_get_expr(p.polqual,p.polrelid),'true') <> 'false'" : ''}
 )) )`;
const extensionMutationsSql = `(SELECT COALESCE(jsonb_agg(jsonb_build_object('table',c.relname,'kind',c.relkind,
 'insertBlocked',${blockedWriteSql('a','INSERT')},'updateBlocked',${blockedWriteSql('w','UPDATE')},'deleteBlocked',${blockedWriteSql('d','DELETE')}) ORDER BY c.relname),'[]'::jsonb)
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') AND EXISTS(SELECT 1 FROM pg_catalog.pg_depend d
 WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))`;
export const anonymousCatalogSql = `SELECT ${extensionMutationsSql} AS extension_mutations,c.relname AS name,c.relkind AS kind,c.relrowsecurity AS rls,
 pg_catalog.has_table_privilege('anon',c.oid,'SELECT') AS anon_table_select,
 pg_catalog.has_any_column_privilege('anon',c.oid,'SELECT') AS anon_column_select,
 ${blockedWriteSql('a','INSERT')} AS anon_insert_blocked,
 ${blockedWriteSql('w','UPDATE')} AS anon_update_blocked,
 ${blockedWriteSql('d','DELETE')} AS anon_delete_blocked,
 (SELECT COALESCE(jsonb_agg(a.attname ORDER BY a.attnum),'[]'::jsonb) FROM pg_catalog.pg_attribute a
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 AND pg_catalog.has_column_privilege('anon',c.oid,a.attnum,'SELECT')) AS anon_select_columns
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_class'::regclass
 AND d.objid=c.oid AND d.deptype='e') ORDER BY c.relname`;

export function anonymousKey(key) {
  try {
    if (typeof key !== 'string' || key.length > 16384) return false;
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(x => !/^[A-Za-z0-9_-]+$/.test(x))) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon' && payload.ref === project
      && Number.isSafeInteger(payload.exp) && payload.exp * 1000 > Date.now();
  } catch { return false; }
}

async function catalogResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('catalog_body_missing');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 131072) throw Error('catalog_body_too_large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function checkAnonymousReads({ anonKey, accessToken }, request = fetch) {
  if (!anonymousKey(anonKey) || typeof accessToken !== 'string' || !accessToken.trim()) throw Error('invalid_credentials');
  const options = { redirect: 'error', signal: AbortSignal.timeout(15000) };
  const catalog = await request(`https://api.supabase.com/v1/projects/${project}/database/query/read-only`, {
    ...options, method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: anonymousCatalogSql }),
  });
  if (!catalog.ok) { await catalog.body?.cancel(); throw Error('catalog_unavailable'); }
  const tables = await catalogResponse(catalog);
  if (!Array.isArray(tables) || tables.length < 1 || tables.length > 200
    || tables.some(t => !/^[a-z][a-z0-9_]{0,62}$/.test(t.name) || !['r','p','v','m','f'].includes(t.kind)
      || typeof t.rls !== 'boolean' || typeof t.anon_table_select !== 'boolean' || typeof t.anon_column_select !== 'boolean'
      || ['anon_insert_blocked','anon_update_blocked','anon_delete_blocked'].some(k => typeof t[k] !== 'boolean')
      || !Array.isArray(t.anon_select_columns) || t.anon_select_columns.some(c => typeof c !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(c))
      || new Set(t.anon_select_columns).size !== t.anon_select_columns.length) || new Set(tables.map(t => t.name)).size !== tables.length) throw Error('invalid_catalog');
  const extensions=tables[0].extension_mutations;
  if(!Array.isArray(extensions)||extensions.length>200||extensions.some(e=>!e||!/^[a-z][a-z0-9_]{0,62}$/.test(e.table)||!['r','p','v','m','f'].includes(e.kind)||['insertBlocked','updateBlocked','deleteBlocked'].some(k=>typeof e[k]!=='boolean'))
    ||new Set(extensions.map(e=>e.table)).size!==extensions.length||tables.some(t=>JSON.stringify(t.extension_mutations)!==JSON.stringify(extensions)))throw Error('invalid_extension_mutation_catalog');
  const extensionResults=extensions.map(e=>({...e,writesBlocked:e.insertBlocked&&e.updateBlocked&&e.deleteBlocked}));
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  // A successful key-authenticated control prevents a revoked/bad key from making all tables appear protected.
  const control = await request(`${origin}/auth/v1/settings`, { ...options, method: 'GET', headers });
  await control.body?.cancel();
  if (control.status !== 200) throw Error('anonymous_key_control_unavailable');
  const results = [];
  for (const table of tables) {
    const row = { table: table.name, relationKind: table.kind, rls: table.rls,
      anon_table_select: table.anon_table_select, anon_column_select: table.anon_column_select,
      writesBlocked: ['anon_insert_blocked','anon_update_blocked','anon_delete_blocked'].every(k => table[k]),
      possibleWrites: ['insert','update','delete'].filter(k => !table[`anon_${k}_blocked`]),
      unexpectedPublicColumns: publicCatalogs.includes(table.name) ? table.anon_select_columns.filter(c => !publicColumns[table.name].includes(c)) : [],
      expectedAccess: publicCatalogs.includes(table.name) ? 'public_catalog' : 'private', status: null, count: null, state: 'unknown' };
    try {
      const response = await request(`${origin}/rest/v1/${table.name}?select=${publicCatalogs.includes(table.name) ? publicColumns[table.name].join(',') : '*'}&limit=0`, {
        redirect: 'error', signal: AbortSignal.timeout(10000), method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' },
      });
      row.status = response.status;
      await response.body?.cancel();
      if ([401,403].includes(response.status)) {
        const proxyStatus = response.headers.get('proxy-status')?.trim() ?? '';
        // JWT failures also return401. Only PostgreSQL permission error42501 proves denial.
        if (/^PostgREST; error="?42501"?$/i.test(proxyStatus)
          && !table.anon_table_select && !table.anon_column_select) row.state = 'access_denied';
      }
      else if ([200,206].includes(response.status)) {
        const match = /^\*\/(0|[1-9][0-9]*)$/.exec(response.headers.get('content-range') ?? '');
        const count = match ? Number(match[1]) : NaN;
        if (Number.isSafeInteger(count)) { row.count = count; row.state = row.expectedAccess === 'public_catalog' ? 'public_catalog' : count === 0 ? 'zero_rows' : 'exposed_rows'; }
      }
    } catch { row.state = 'request_failed'; }
    results.push(row);
  }
  const applicationPassed=results.every(r => r.writesBlocked && r.unexpectedPublicColumns.length === 0 && (r.expectedAccess === 'public_catalog' ? r.state === 'public_catalog' : ['zero_rows','access_denied'].includes(r.state)));
  const extensionPassed=extensionResults.every(r=>r.writesBlocked);
  return { at: new Date().toISOString(), project, state: extensionPassed && applicationPassed ? 'passed' : 'failed',
    applicationState:applicationPassed?'passed':'failed',extensionMutationState:extensionPassed?'passed':'failed',
    relationCount: tables.length, results, extensionResults, mutationRelationCount: tables.length+extensions.length,
    privateRelationCount: results.filter(r => r.expectedAccess === 'private').length,
    publicExceptions: results.filter(r => r.expectedAccess === 'public_catalog').map(r => r.table), rowsRetrieved: 0,
    limits: ['A zero count proves current visibility only; seeded policy tests are required for empty tables.',
      'Permission denial requires42501 and no anonymous table or column SELECT privilege; partial column access fails closed.',
      'Write proof uses effective grants and conservative applicable policy analysis; unknown predicates fail closed, not a live DML probe.',
      'Public column allowlists detect schema exposure, not private values nested inside otherwise approved public fields.',
      'Read/column coverage excludes extension-owned relations; mutation checks include every public relation. RPC functions, other schemas and Storage are excluded.',
      'No policy, row, secret, mail, provider or Worker change occurred.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (async () => {
    if (process.argv.length !== 4 || process.argv[2] !== '--out') throw Error('usage');
    const output = resolve(process.argv[3]);
    if (!output.startsWith('/home/dev/.local/state/localley/')) throw Error('private_output_required');
    const local = parseEnv(await readFile('/home/dev/projects/CyberLink/apps/Localley/.env.local', 'utf8'));
    const shared = parseEnv(await readFile('/home/dev/secrets/keys.env', 'utf8'));
    const report = await checkAnonymousReads({ anonKey: local.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      accessToken: local.SUPABASE_ACCESS_TOKEN || shared.SUPABASE_ACCESS_TOKEN });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ state: report.state, applicationState:report.applicationState,extensionMutationState:report.extensionMutationState, relations: report.relationCount, rowsRetrieved: 0,
      publicCatalogs: report.publicExceptions, privateRelations: report.privateRelationCount, exposed: report.results.filter(r => r.state === 'exposed_rows').map(r => r.table), extensionWriteFailures: report.extensionResults.filter(r=>!r.writesBlocked), writeFailures: report.results.filter(r => !r.writesBlocked).map(r => ({table:r.table,commands:r.possibleWrites})),
      columnFailures: report.results.filter(r => r.unexpectedPublicColumns.length).map(r => ({table:r.table,columns:r.unexpectedPublicColumns})), unknown: report.results.filter(r => ['unknown','request_failed'].includes(r.state)).map(r => r.table) }));
    if (report.state !== 'passed') process.exitCode = 1;
  })().catch(() => { console.error('Anonymous regression incomplete; no row values or credentials recorded.'); process.exitCode = 1; });
}
