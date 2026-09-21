import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mediaFormat} from './cloudflare-story-media.mjs';

const account='664f242340bcec2f32daaeee15f58bde';
export function validateObject(record,bytes){
  if(!record || !/^[a-f0-9]{64}$/.test(record.sha256) || !['image/png','image/jpeg'].includes(record.contentType))throw new Error('invalid_object');
  const f=mediaFormat(bytes),file=`${record.sha256}.${f.extension}`;
  if(record.key!==`legacy/${file}` || record.file!==`objects/${file}` || record.contentType!==f.type || record.bytes!==bytes.length
    || bytes.length>20*1024*1024 || createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw new Error('object_integrity_failed');
}
export async function uploadMedia(directory,token){
  const m=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
  if(!token || m.version!==1 || m.complete!==true || m.kind!=='legacy_story_media' || m.bucket!=='localley-legacy-media' || m.jurisdiction!=='eu' || m.unresolved.length || !Array.isArray(m.objects) || m.objects.length>1000)throw new Error('unapproved_manifest');
  const base=`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${m.bucket}`;
  const headers={Authorization:`Bearer ${token}`,'cf-r2-jurisdiction':'eu'};
  for(const kind of ['managed','custom']){
    const r=await fetch(`${base}/domains/${kind}`,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
    const j=await r.json();if(!r.ok||!j.success || (kind==='managed'?j.result.enabled:j.result.domains.length!==0))throw new Error('bucket_not_private');
  }
  // Validate every local object before the first remote write, with no caller-controlled paths.
  for(const o of m.objects){
    if(!/^objects\/[a-f0-9]{64}\.(?:png|jpg)$/.test(o.file))throw new Error('invalid_object_path');
    validateObject(o,await readFile(join(directory,o.file)));
  }
  const report={complete:false,bucket:m.bucket,jurisdiction:'eu',verified:[],failures:[]};
  let index=0;
  const verify=async o=>{
    const r=await fetch(`${base}/objects/${o.key}`,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
    if(r.status===404){await r.body?.cancel();return false;}
    if(!r.ok){await r.body?.cancel();throw new Error('remote_read_failed');}
    const reader=r.body.getReader(),hash=createHash('sha256');let n=0;
    try{while(true){const c=await reader.read();if(c.done)break;n+=c.value.length;if(n>o.bytes)throw new Error('remote_size_mismatch');hash.update(c.value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    if(n!==o.bytes||hash.digest('hex')!==o.sha256)throw new Error('remote_hash_mismatch');return true;
  };
  const worker=async()=>{while(index<m.objects.length){const o=m.objects[index++];try{
    if(!await verify(o)){
      const exit=await new Promise(done=>{
        const child=spawn('npx',['wrangler','r2','object','put',`${m.bucket}/${o.key}`,'--file',join(directory,o.file),'--jurisdiction','eu','--remote','--content-type',o.contentType],
          {cwd:resolve('cloudflare/auth-proof'),env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account},stdio:'ignore',timeout:120000,killSignal:'SIGTERM'});
        child.once('error',()=>done(1));child.once('exit',code=>done(code??1));
      });
      // Verify even an uncertain upload result; never automatically retry a write.
      if(!await verify(o))throw new Error(exit===0?'upload_not_found':'upload_failed');
    }
    report.verified.push(o.sha256);
  }catch(error){report.failures.push({sha256:o.sha256,reason:error.message});}}};
  await Promise.all([worker(),worker()]);
  report.complete=report.verified.length===m.objects.length&&report.failures.length===0;
  await writeFile(join(directory,'r2-receipt.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [arg,directory]=process.argv.slice(2);
  if(arg!=='--apply'||!directory||process.argv.length!==4){console.error('usage: cloudflare-media-upload.mjs --apply PRIVATE_STAGED_DIRECTORY');process.exitCode=1;}
  else (async()=>{const token=parseEnv(await readFile(join(homedir(),'secrets/keys.env'),'utf8')).CLOUDFLARE_API_TOKEN;const r=await uploadMedia(resolve(directory),token);console.log(JSON.stringify({complete:r.complete,verified:r.verified.length,failures:r.failures.length}));if(!r.complete)process.exitCode=1;})().catch(()=>{console.error('R2 media transfer incomplete; retain private evidence before retrying.');process.exitCode=1;});
}
