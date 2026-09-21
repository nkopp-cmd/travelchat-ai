import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const SOURCE = 'https://llehrhqeolfprutcaopi.supabase.co';
const hash = text => createHash('sha256').update(text).digest('hex');
const SYSTEM_TABLES = new Set(['spatial_ref_sys', 'geometry_columns', 'geography_columns']);

export function sourceTables(spec) {
  if (!spec?.paths || !spec.definitions) throw new Error('missing_source_schema');
  const tables = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    if (path === '/' || path.startsWith('/rpc/')) continue;
    const name = path.slice(1);
    if (SYSTEM_TABLES.has(name)) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !methods.get) throw new Error('unsupported_source_path');
    const properties = spec.definitions[name]?.properties;
    const primaryKey = Object.entries(properties ?? {}).filter(([, value]) => value.description?.includes('<pk/>')).map(([key]) => key);
    if (!primaryKey.length || primaryKey.some(key => !/^[a-z][a-z0-9_]*$/.test(key))) throw new Error(`missing_primary_key:${name}`);
    tables.push({ name, primaryKey });
  }
  return tables.sort((a,b) => a.name.localeCompare(b.name));
}

async function boundedText(response) {
  if (!response.body) throw new Error('missing_response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32 * 1024 * 1024) throw new Error('source_page_too_large');
      text += decoder.decode(value,{stream:true});
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}

export async function snapshotSource({ key, output, request = fetch }) {
  if (!key) throw new Error('missing_source_credential');
  // Create a new private directory, never overwrite prior or partial evidence.
  await mkdir(output, { mode: 0o700 });
  const manifest = { version: 1, source: SOURCE, startedAt: new Date().toISOString(), complete: false,
    scope: 'REST-exposed application tables only; excludes auth, storage objects and system views', tables: [] };
  const saveManifest = () => writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  await saveManifest();
  let totalBytes = 0;
  const get = async path => {
    const response = await request(`${SOURCE}/rest/v1/${path}`, { method:'GET', redirect:'error', signal:AbortSignal.timeout(30000),
      headers:{apikey:key,Authorization:`Bearer ${key}`,Prefer:'count=exact',Accept:path ? 'application/json' : 'application/openapi+json'} });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`source_http_${response.status}`); }
    const text = await boundedText(response);
    totalBytes += Buffer.byteLength(text);
    if (totalBytes > 512 * 1024 * 1024) throw new Error('snapshot_byte_budget');
    return {text,range:response.headers.get('content-range')};
  };
  try {
    const schema = await get('');
    const tables = sourceTables(JSON.parse(schema.text));
    await writeFile(join(output,'schema.json'),schema.text,{mode:0o600,flag:'wx'});
    manifest.schemaSha256 = hash(schema.text);
    for (const table of tables) {
      const record = {...table, count: 0, pages: []};
      const seen = new Set();
      let total = null, offset = 0;
      const limit = table.name === 'itineraries' ? 1 : 100;
      do {
        if (record.pages.length >= 2000) throw new Error(`table_page_budget:${table.name}`);
        const query = `${table.name}?select=*&order=${table.primaryKey.map(k=>`${k}.asc`).join(',')}&limit=${limit}&offset=${offset}`;
        const page = await get(query);
        const rows = JSON.parse(page.text);
        const match = /\/(\d+)$/.exec(page.range ?? '');
        if (!Array.isArray(rows) || !match) throw new Error(`missing_exact_count:${table.name}`);
        const count = Number(match[1]);
        if (!Number.isSafeInteger(count) || (total !== null && total !== count)) throw new Error(`source_changed:${table.name}`);
        total = count;
        if ((!rows.length && offset < total) || rows.length > limit || offset + rows.length > total) throw new Error(`invalid_page:${table.name}`);
        for (const row of rows) {
          const parts = table.primaryKey.map(k=>row[k]);
          if (parts.some(v=>v===null || v===undefined || (typeof v!=='string' && !Number.isSafeInteger(v)))) throw new Error(`invalid_primary_key:${table.name}`);
          const id = JSON.stringify(parts);
          if (seen.has(id)) throw new Error(`duplicate_primary_key:${table.name}`);
          seen.add(id);
        }
        const file = `${table.name}-${record.pages.length}.json`;
        await writeFile(join(output,file),page.text,{mode:0o600,flag:'wx'});
        record.pages.push({file,query,rows:rows.length,sha256:hash(page.text)});
        offset += rows.length;
      } while (offset < total);
      record.count = total;
      manifest.tables.push(record);
      await saveManifest();
    }
    // Re-read every page: refuse a stable-snapshot claim if the running source changed.
    // This is observed stability, NOT a transactional database snapshot or a cutover write freeze.
    for (const table of manifest.tables) for (const page of table.pages) {
      const reread = await get(page.query);
      if (hash(reread.text)!==page.sha256 || Number(/\/(\d+)$/.exec(reread.range??'')?.[1])!==table.count) throw new Error(`source_changed:${table.name}`);
    }
    const schemaAgain = await get('');
    if (hash(schemaAgain.text)!==manifest.schemaSha256) throw new Error('source_schema_changed');
    manifest.complete = true;
    manifest.finishedAt = new Date().toISOString();
    await saveManifest();
    return manifest;
  } catch (error) {
    manifest.failure = error instanceof Error && /^[a-z_]+(?::[a-z_]+)?$/.test(error.message) ? error.message : 'snapshot_failed';
    await saveManifest();
    throw new Error(manifest.failure);
  }
}

export async function verifySnapshot(directory) {
  const manifest = JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
  if (manifest.version!==1 || manifest.source!==SOURCE || manifest.complete!==true || !Array.isArray(manifest.tables)) throw new Error('incomplete_manifest');
  const schema = await readFile(join(directory,'schema.json'),'utf8');
  if (hash(schema)!==manifest.schemaSha256) throw new Error('schema_hash_mismatch');
  const expected = sourceTables(JSON.parse(schema));
  if (JSON.stringify(expected)!==JSON.stringify(manifest.tables.map(t=>({name:t.name,primaryKey:t.primaryKey})))) throw new Error('table_inventory_mismatch');
  for (const table of manifest.tables) {
    let count=0;
    const seen=new Set();
    if (!Array.isArray(table.pages) || !table.pages.length) throw new Error('missing_pages');
    for (const [index,page] of table.pages.entries()) {
      if (page.file!==`${table.name}-${index}.json`) throw new Error('invalid_page_path');
      const text=await readFile(join(directory,page.file),'utf8');
      if(hash(text)!==page.sha256) throw new Error('page_hash_mismatch');
      const rows=JSON.parse(text);
      if(!Array.isArray(rows) || rows.length!==page.rows) throw new Error('page_count_mismatch');
      count+=rows.length;
      for(const row of rows){
        const parts=table.primaryKey.map(k=>row[k]);
        if(parts.some(v=>v===undefined || v===null))throw new Error('missing_primary_key');
        const id=JSON.stringify(parts);if(seen.has(id))throw new Error('duplicate_primary_key');seen.add(id);
      }
    }
    if(count!==table.count)throw new Error('table_count_mismatch');
  }
  return {verified:true,tables:manifest.tables.length,rows:manifest.tables.reduce((n,t)=>n+t.count,0),manifestSha256:hash(await readFile(join(directory,'manifest.json'),'utf8'))};
}

async function main() {
  const args = process.argv.slice(2);
  if(args.length===2 && args[0]==='--verify'){console.log(JSON.stringify(await verifySnapshot(resolve(args[1]))));return;}
  if (args.length !== 2 || args[0] !== '--out') throw new Error('usage: node scripts/cloudflare-source-snapshot.mjs --out PRIVATE_NEW_DIRECTORY or --verify DIRECTORY');
  const env = parseEnv(await readFile('.env.local','utf8'));
  if (env.NEXT_PUBLIC_SUPABASE_URL !== SOURCE) throw new Error('unexpected_source');
  const manifest = await snapshotSource({key:env.SUPABASE_SERVICE_ROLE_KEY,output:resolve(args[1])});
  console.log(JSON.stringify({complete:manifest.complete,tables:manifest.tables.map(t=>({name:t.name,count:t.count})),source:SOURCE}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{console.error('Source snapshot incomplete. Inspect the private manifest; no destination changes were made.');process.exitCode=1;});
}
