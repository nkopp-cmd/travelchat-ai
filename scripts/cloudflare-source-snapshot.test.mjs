import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {snapshotSource,sourceTables,verifySnapshot,SOURCE} from './cloudflare-source-snapshot.mjs';

const schema = {paths:{'/users':{get:{}},'/spatial_ref_sys':{get:{}},'/rpc/mutate':{post:{}}},definitions:{users:{properties:{id:{description:'Primary Key.<pk/>'},email:{type:'string'}}}}};
test('source discovery requires primary keys and excludes system/RPC paths',()=>{
  assert.deepEqual(sourceTables(schema),[{name:'users',primaryKey:['id']}]);
  assert.throws(()=>sourceTables({...schema,definitions:{users:{properties:{}}}}),/missing_primary_key/);
});
test('private snapshot retains exact raw JSON and rechecks source stability',async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-export-'));const output=join(root,'private');let reads=0;
  const raw='[{"id":"fixture","precise":123456789012345678901,"optional":null}]';
  try{
    const result=await snapshotSource({key:'test-only',output,request:async(url,init)=>{
      assert.ok(url.startsWith(SOURCE));assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
      if(url.endsWith('/rest/v1/'))return Response.json(schema);
      reads++;return new Response(raw,{headers:{'content-range':'0-0/1'}});
    }});
    assert.equal(result.complete,true);assert.equal(reads,2);assert.equal(await readFile(join(output,'users-0.json'),'utf8'),raw);
    assert.equal((await stat(output)).mode&0o777,0o700);assert.equal((await stat(join(output,'users-0.json'))).mode&0o777,0o600);
    assert.equal((await verifySnapshot(output)).rows,1);
    await writeFile(join(output,'users-0.json'),'[]');
    await assert.rejects(verifySnapshot(output),/page_hash_mismatch/);
    await assert.rejects(snapshotSource({key:'test-only',output}),/EEXIST/);
  }finally{await rm(root,{recursive:true,force:true});}
});
for(const mode of ['changed','duplicate','missing-count','http-error'])test(`incomplete evidence retained for ${mode}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-export-'));const output=join(root,'private');let reads=0;
  try{
    await assert.rejects(snapshotSource({key:'test-only',output,request:async url=>{
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
