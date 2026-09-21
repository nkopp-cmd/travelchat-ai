import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {snapshotSource} from './cloudflare-source-snapshot.mjs';
import {stageStoryMedia,mediaFormat,permittedMediaURL} from './cloudflare-story-media.mjs';

test('media sources and formats cannot silently follow redirects or accept WebP',()=>{
  assert.equal(mediaFormat(Buffer.from([255,216,255,0])).extension,'jpg');
  assert.throws(()=>mediaFormat(Buffer.from('RIFF....WEBP')),/unsupported_image/);
  for(const url of ['http://images.pexels.com/photos/1/a.jpg','https://images.pexels.com@evil.test/photos/1/a.jpg','https://localhost/secret','https://llehrhqeolfprutcaopi.supabase.co/rest/v1/users'])assert.throws(()=>permittedMediaURL(url));
});
test('staging removes inline bytes, deduplicates exact images and preserves unresolved sources',async()=>{
  const root=await mkdtemp(join(tmpdir(),'localley-media-'));
  try{
    const schema={paths:{'/itineraries':{get:{}}},definitions:{itineraries:{properties:{id:{description:'<pk/>'}}}}};
    const inline='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
    const rows=[{id:'11111111-1111-4111-8111-111111111111',ai_backgrounds:{cover:inline,day1:inline},story_slides:['https://llehrhqeolfprutcaopi.supabase.co/storage/v1/object/public/generated-images/fixture.png','https://images.pexels.com/photos/1/image.jpg']}];
    await snapshotSource({key:'test',output:join(root,'snapshot'),request:async url=>url.endsWith('/rest/v1/')?Response.json(schema):Response.json(rows,{headers:{'content-range':'0-0/1'}})});
    const report=await stageStoryMedia(join(root,'snapshot'),join(root,'media'),async(url,init)=>{
      assert.equal(init.redirect,'manual');
      if(new URL(url).hostname==='llehrhqeolfprutcaopi.supabase.co'){
        assert.ok(url.includes('/object/authenticated/'));assert.equal(init.headers.Authorization,'Bearer test-only');
        return new Response(Buffer.from([137,80,78,71,13,10,26,10]));
      }
      assert.equal(init.headers.Authorization,undefined);
      return new Response(null,{status:302,headers:{location:'https://evil.test/image'}});
    },'test-only');
    assert.equal(report.complete,false);assert.equal(report.objects.length,1);assert.equal(report.references.length,3);assert.equal(report.unresolved[0].reason,'media_http_302');
    const projected=JSON.parse(await readFile(join(root,'media',`${rows[0].id}.json`),'utf8'));
    assert.equal(projected.ai_backgrounds.cover,projected.ai_backgrounds.day1);assert.ok(projected.ai_backgrounds.cover.startsWith('r2://'));assert.equal(projected.story_slides[1],rows[0].story_slides[1]);
    assert.equal(JSON.parse(await readFile(join(root,'snapshot','itineraries-0.json'),'utf8'))[0].ai_backgrounds.cover,inline);
  }finally{await rm(root,{recursive:true,force:true});}
});
