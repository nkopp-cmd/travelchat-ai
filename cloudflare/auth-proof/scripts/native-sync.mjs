// Run on the CyberLink host with Tailscale and its existing Cloudflare credential.
// This imports private candidates only. Publication remains a separate reviewed step.
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareNativeImport } from './native-import.mjs';

const args=process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) throw new Error('Usage: node scripts/native-sync.mjs [--apply]');
const root=new URL('../',import.meta.url);
const config=JSON.parse(readFileSync(new URL('wrangler.preview.jsonc',root),'utf8'));
if (config.name !== 'localley-discovery-preview' || config.account_id !== '664f242340bcec2f32daaeee15f58bde'
  || config.d1_databases?.length !== 1 || config.d1_databases[0].database_id !== 'e943548b-01ae-485d-9219-e2a46cb0da8e') throw new Error('Unexpected preview target');
let offset=0,totalBytes=0;
const records=[];
for (let page=0;page<50;page++) {
  const response=await fetch(`http://100.112.156.12:3010/api/localley/staged?city=seoul&limit=100&offset=${offset}`,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Native source HTTP ${response.status}`);
  const reader=response.body.getReader(),chunks=[];
  try {
    for (;;) {
      const {value,done}=await reader.read();if(done) break;
      totalBytes+=value.byteLength;
      if(totalBytes>8*1024*1024) throw new Error('Native feed exceeds 8 MiB');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(body.publicationReady!==false || !Array.isArray(body.records) || body.records.length>100) throw new Error('Invalid native feed');
  records.push(...body.records);
  if(body.nextOffset===null) break;
  if(!Number.isSafeInteger(body.nextOffset) || body.nextOffset<=offset || page===49) throw new Error('Invalid or excessive native pagination');
  offset=body.nextOffset;
}
const {sql,...receipt}=prepareNativeImport({publicationReady:false,records});
if(!receipt.accepted) throw new Error('No acceptable native places');
if(args[0]==='--apply') {
  if(!process.env.CLOUDFLARE_API_TOKEN) throw new Error('Existing Cloudflare credential required');
  const parent=new URL('.preview-private/',root);mkdirSync(parent,{recursive:true,mode:0o700});
  const dir=mkdtempSync(fileURLToPath(new URL('native-sync-',parent)));
  try {
    const file=dir+'/import.sql';writeFileSync(file,sql,{mode:0o600});
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js',root)),
      'd1','execute','localley-migration-preview','--config',fileURLToPath(new URL('wrangler.preview.jsonc',root)),
      '--remote','--file',file,'--yes','--json'],{cwd:fileURLToPath(root),env:process.env,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
    // Do not print Wrangler output: export/import output can contain temporary signed URLs.
    if(result.error || result.status!==0) throw new Error(`Native preview import failed (${result.error?.code || result.status}); retry is safe`);
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
console.log(JSON.stringify({...receipt,applied:args[0]==='--apply',target:'localley-migration-preview',sourceBytes:totalBytes}));
