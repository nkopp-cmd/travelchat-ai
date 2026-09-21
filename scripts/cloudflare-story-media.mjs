import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {verifySnapshot,SOURCE} from './cloudflare-source-snapshot.mjs';

export function mediaFormat(bytes) {
  if(bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {extension:'png',type:'image/png'};
  if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return {extension:'jpg',type:'image/jpeg'};
  throw new Error('unsupported_image_bytes');
}
export function permittedMediaURL(value) {
  const u=new URL(value);
  if(u.protocol!=='https:' || u.username || u.password || u.port || u.hash)throw new Error('unapproved_media_url');
  if(u.origin===SOURCE && u.pathname.startsWith('/storage/v1/object/'))return u;
  if(u.hostname==='images.pexels.com' && u.pathname.startsWith('/photos/'))return u;
  throw new Error('unapproved_media_url');
}
export async function stageStoryMedia(input,output,request=fetch,sourceKey='') {
  await verifySnapshot(input);
  await mkdir(output,{mode:0o700});
  await mkdir(join(output,'objects'),{mode:0o700});
  const manifest=JSON.parse(await readFile(join(input,'manifest.json'),'utf8'));
  const table=manifest.tables.find(t=>t.name==='itineraries');
  if(!table)throw new Error('missing_itineraries');
  const report={version:1,complete:false,bucket:'localley-legacy-media',jurisdiction:'eu',kind:'legacy_story_media',references:[],objects:[],unresolved:[],rows:0,maxProjectedRowBytes:0};
  const bytesByHash=new Map(),cache=new Map();let total=0;
  const save=()=>writeFile(join(output,'manifest.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  await save();
  const store=async value=>{
    if(cache.has(value))return cache.get(value);
    let bytes,source;
    if(value.startsWith('data:image/')){
      const m=/^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if(!m || m[1].length>28*1024*1024)throw new Error('invalid_inline_image');
      bytes=Buffer.from(m[1],'base64');if(bytes.toString('base64')!==m[1])throw new Error('invalid_base64');source='inline';
    }else{
      const url=permittedMediaURL(value);
      const headers={};
      if(sourceKey && url.origin===SOURCE){
        // Privileged migration read, never make the bucket public or send this key to an external host.
        url.pathname=url.pathname.replace('/storage/v1/object/public/','/storage/v1/object/authenticated/');
        headers.Authorization=`Bearer ${sourceKey}`;
        headers.apikey=sourceKey;
      }
      const response=await request(url.href,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
      if(!response.ok){await response.body?.cancel();throw new Error(`media_http_${response.status}`);}
      if(!response.body)throw new Error('empty_media');
      const reader=response.body.getReader(),chunks=[];let length=0;
      try{while(true){const c=await reader.read();if(c.done)break;length+=c.value.length;if(length>20*1024*1024)throw new Error('media_too_large');chunks.push(Buffer.from(c.value));}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      bytes=Buffer.concat(chunks);source=url.origin;
    }
    if(bytes.length>20*1024*1024)throw new Error('media_too_large');
    const format=mediaFormat(bytes),sha=createHash('sha256').update(bytes).digest('hex'),key=`legacy/${sha}.${format.extension}`;
    if(!bytesByHash.has(sha)){
      total+=bytes.length;if(total>512*1024*1024)throw new Error('media_budget');
      await writeFile(join(output,'objects',`${sha}.${format.extension}`),bytes,{mode:0o600,flag:'wx'});
      const object={key,file:`objects/${sha}.${format.extension}`,sha256:sha,bytes:bytes.length,contentType:format.type};
      report.objects.push(object);bytesByHash.set(sha,object);
    }
    const result={key,source};cache.set(value,result);return result;
  };
  const transform=async(value,id,path)=>{
    if(typeof value==='string' && (/^data:image\//.test(value) || /^https?:/.test(value))){
      try{const result=await store(value);report.references.push({itineraryId:id,path,...result});return `r2://${report.bucket}/${result.key}`;}
      catch(error){report.unresolved.push({itineraryId:id,path,reason:error instanceof Error&&/^[a-z_0-9]+$/.test(error.message)?error.message:'media_failed'});return value;}
    }
    if(Array.isArray(value)){const result=[];for(const [i,v] of value.entries())result.push(await transform(v,id,`${path}/${i}`));return result;}
    if(value&&typeof value==='object'){
      const result={};for(const [key,v] of Object.entries(value))Object.defineProperty(result,key,{value:await transform(v,id,`${path}/${key}`),enumerable:true});return result;
    }
    return value;
  };
  for(const page of table.pages){
    const rows=JSON.parse(await readFile(join(input,page.file),'utf8'));
    for(const row of rows){
      if(!/^[0-9a-f-]{36}$/.test(row.id))throw new Error('invalid_itinerary_id');
      for(const field of ['ai_backgrounds','story_slides'])row[field]=await transform(row[field],row.id,field);
      const text=JSON.stringify(row);report.maxProjectedRowBytes=Math.max(report.maxProjectedRowBytes,Buffer.byteLength(text));report.rows++;
      await writeFile(join(output,`${row.id}.json`),text,{mode:0o600,flag:'wx'});
    }
    await save();
  }
  report.complete=report.unresolved.length===0 && report.maxProjectedRowBytes<2*1024*1024;
  await save();return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2);
  if(!input||!output||process.argv.length!==4){console.error('usage: cloudflare-story-media.mjs VERIFIED_SNAPSHOT NEW_PRIVATE_OUTPUT');process.exitCode=1;}
  else (async()=>{const env=parseEnv(await readFile('.env.local','utf8'));if(env.NEXT_PUBLIC_SUPABASE_URL!==SOURCE)throw new Error('unexpected_source');return stageStoryMedia(resolve(input),resolve(output),fetch,env.SUPABASE_SERVICE_ROLE_KEY);})().then(r=>{console.log(JSON.stringify({complete:r.complete,rows:r.rows,objects:r.objects.length,references:r.references.length,unresolved:r.unresolved.length,maxProjectedRowBytes:r.maxProjectedRowBytes}));if(!r.complete)process.exitCode=1;}).catch(()=>{console.error('Story media staging incomplete; private evidence retained.');process.exitCode=1;});
}
