import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {snapshotSource,sourceTables,verifySnapshot,SOURCE,privateOutput} from './cloudflare-source-snapshot.mjs';

const key = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'service_role', ref: 'llehrhqeolfprutcaopi' })).toString('base64url'), 'fixture'].join('.');
const schema = {paths:{'/spots':{get:{}},'/spatial_ref_sys':{get:{}},'/rpc/mutate':{post:{}}},definitions:{spots:{properties:{id:{description:'Primary Key.<pk/>'},email:{type:'string'}}}}};
test('source discovery requires primary keys and excludes system/RPC paths',()=>{
  assert.deepEqual(sourceTables(schema),[{name:'spots',primaryKey:['id']}]);
  assert.throws(()=>sourceTables({...schema,definitions:{spots:{properties:{}}}}),/missing_primary_key/);
});
test('private snapshot retains exact raw JSON and rechecks source stability',async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-export-'));const output=join(root,'private');let reads=0;
  const raw='[{"id":"fixture","precise":123456789012345678901,"optional":null}]';
  try{
    const result=await snapshotSource({key,output,request:async(url,init)=>{
      assert.ok(url.startsWith(SOURCE));assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
      if(url.endsWith('/rest/v1/'))return Response.json(schema);
      reads++;return new Response(raw,{headers:{'content-range':'0-0/1'}});
    }});
    assert.equal(result.complete,true);assert.equal(result.cutoverReady,false);assert.equal(result.transactional,false);assert.equal(result.physicalInventoryComplete,false);assert.equal(reads,2);assert.equal(await readFile(join(output,'spots-0.json'),'utf8'),raw);
    assert.equal((await stat(output)).mode&0o777,0o700);assert.equal((await stat(join(output,'spots-0.json'))).mode&0o777,0o600);
    assert.equal((await verifySnapshot(output)).rows,1);
    await writeFile(join(output,'spots-0.json'),'[]');
    await assert.rejects(verifySnapshot(output),/page_hash_mismatch/);
    await assert.rejects(snapshotSource({key,output}),/EEXIST/);
  }finally{await rm(root,{recursive:true,force:true});}
});
for(const mode of ['changed','duplicate','missing-count','http-error'])test(`incomplete evidence retained for ${mode}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-export-'));const output=join(root,'private');let reads=0;
  try{
    await assert.rejects(snapshotSource({key,output,request:async url=>{
      if(url.endsWith('/rest/v1/'))return Response.json(schema);
      reads++;
      if(mode==='http-error')return new Response('private failure details',{status:500});
      const rows=mode==='duplicate'?[{id:'a'},{id:'a'}]:[{id:reads>1&&mode==='changed'?'b':'a'}];
      return Response.json(rows,{headers:mode==='missing-count'?{}:{'content-range':`0-${rows.length-1}/${rows.length}`}});
    }}));
    const m=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));assert.equal(m.complete,false);
    assert.ok(!JSON.stringify(m).includes('private failure details'));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('public credentials refuse before creating evidence or reading source',async()=>{
  let calls=0;
  await assert.rejects(snapshotSource({key:'sb_publishable_fixture',output:'/unused',request:async()=>{calls++;}}),/invalid_source_credential/);
  assert.equal(calls,0);
});

test('private output refuses repository and symlink escapes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-path-'));
  try {
    const privateRoot=join(root,'private');await mkdir(privateRoot);
    assert.equal(await privateOutput(join(privateRoot,'new'),privateRoot),join(privateRoot,'new'));
    await assert.rejects(privateOutput('/home/dev/projects/CyberLink/new',privateRoot),/private_output_required/);
    await symlink(root,join(privateRoot,'escape'));
    await assert.rejects(privateOutput(join(privateRoot,'escape','new'),privateRoot),/private_output_required/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('empty tables and schema changes retain the correct completeness claim',async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-empty-'));let schemas=0;
  try{
    const empty=join(root,'empty');
    await snapshotSource({key,output:empty,request:async url=>url.endsWith('/rest/v1/')?Response.json(schema):Response.json([],{headers:{'content-range':'*/0'}})});
    assert.equal((await verifySnapshot(empty)).rows,0);
    const changed=join(root,'changed');
    await assert.rejects(snapshotSource({key,output:changed,request:async url=>{
      if(url.endsWith('/rest/v1/'))return Response.json(++schemas===1?schema:{...schema,info:{version:'changed'}});
      return Response.json([],{headers:{'content-range':'*/0'}});
    }}),/source_schema_changed/);
    assert.equal(JSON.parse(await readFile(join(changed,'manifest.json'))).complete,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
