import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPreviewExpectations, previewExpectations, assertPreviewCatalog, checkPreviewAssets, checkPreviewHttp } from '../scripts/check-native-preview.mjs';

const root = new URL('../',import.meta.url);
const expected = await loadPreviewExpectations();
const payload = () => ({spots:expected.spots.map(spot => ({...structuredClone(spot),city:'Seoul',localley_score:null,
  photoCredits:spot.photoCredits.map(({url,author,license,licenseUrl,sourceUrl}) => ({url,author,license,licenseUrl,sourceUrl}))})),nextOffset:null});

test('preview acceptance derives eight unique places and eight images from current manifests',()=>{
  assert.equal(expected.spots.length,8);
  assert.equal(expected.native.length,5);
  assert.equal(expected.assets.length,8);
  assertPreviewCatalog(payload(),expected);
});

for (const [name,mutate] of Object.entries({
  'stale four-place catalog': data=>{data.spots=data.spots.slice(0,4);},
  'changed source-alias UUID': data=>{data.spots[3].id='00000000-0000-4000-8000-000000000000';},
  'duplicate ID': data=>{data.spots[3].id=data.spots[0].id;},
  'wrong name': data=>{data.spots[3].name.en='Other venue';},
  'wrong address': data=>{data.spots[3].address='Other address';},
  'wrong coordinates': data=>{data.spots[3].latitude+=0.01;},
  'nonfinite coordinates': data=>{data.spots[3].longitude=NaN;},
  'source URLs dropped by DTO': data=>{data.spots=data.spots.map(spot=>({...spot,sourceUrls:spot.sourceUrls.filter(url=>!new URL(url).search)}));},
  'missing credit': data=>{data.spots[3].photoCredits=[];},
  'wrong license': data=>{data.spots[3].photoCredits[0].license='unknown';},
  'wrong author': data=>{data.spots[3].photoCredits[0].author='Other author';},
  'wrong image': data=>{data.spots[3].photos=[data.spots[1].photos[0]];},
  'historical caveat removed': data=>{data.spots.at(-1).description.en='Current venue view';},
  'unapproved score': data=>{data.spots[3].localley_score=5;},
  'partial pagination': data=>{data.nextOffset=8;},
})) test(`preview catalog rejects ${name}`,()=>{
  const data=payload();mutate(data);
  assert.throws(()=>assertPreviewCatalog(data,expected),/catalog\./);
});

test('manifest acceptance rejects collisions, missing policy links, and mismatched asset hashes',async()=>{
  const load = async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
  const [base,native,manifest,notices]=await Promise.all([load('pilot/catalog.json'),load('pilot/native-reviewed.json'),load('pilot/manifest.json'),readFile(new URL('pilot/licenses.md',root),'utf8')]);
  const duplicate=structuredClone(native);duplicate.spots[0].id=base.spots[0].id;
  assert.throws(()=>previewExpectations(base,duplicate,manifest,notices),/duplicate_identity/);
  const noPolicy=structuredClone(native);noPolicy.spots[1].sourceUrls=noPolicy.spots[1].sourceUrls.filter(url=>!url.includes('/page/copyright'));
  assert.throws(()=>previewExpectations(base,noPolicy,manifest,notices),/archive_policy/);
  const wrongHash=structuredClone(manifest);wrongHash.files[0].sha256='0'.repeat(64);
  assert.throws(()=>previewExpectations(base,native,wrongHash,notices),/reviewed_image_hash/);
});

test('assets-only verifies exact JPEG bytes and deployed public notices without requiring eight records',async()=>{
  const paths=[];
  const assets=await checkPreviewAssets(expected,async path=>{
    paths.push(path);
    return new Response(await readFile(new URL(path==='/pilot/licenses.txt'?'pilot/licenses.md':path.replace('/pilot/','pilot/images/'),root)),
      {headers:{'content-type':path.endsWith('.jpg')?'image/jpeg':'text/plain'}});
  });
  assert.equal(assets.assets.length,8);
  assert.equal(assets.publicNotices,'exact_match');
  assert.equal(paths.length,9);
  assert.ok(paths.every(path=>path.startsWith('/pilot/')));
});

for (const [name,response] of [
  ['missing image',()=>new Response(null,{status:404})],
  ['WebP header',()=>new Response('RIFF',{headers:{'content-type':'image/webp'}})],
  ['disguised non-JPEG',()=>new Response('RIFF',{headers:{'content-type':'image/jpeg'}})],
  ['changed JPEG',()=>new Response(Buffer.from([255,216,255,0]),{headers:{'content-type':'image/jpeg'}})],
]) test(`asset acceptance rejects ${name}`,async()=>{
  await assert.rejects(checkPreviewAssets(expected,response),/asset\./);
});

test('assets-only retains anonymous/service denials but deliberately skips the staged catalog count',async()=>{
  let probes=0;
  const request=async(path,service,method)=>{
    if (!service) return new Response(null,{status:403});
    if (method==='POST') {assert.equal(path,'/api/auth/sign-up/email');probes++;return new Response(null,{status:403});}
    if (path==='/api/health') return Response.json({ok:true});
    if (path==='/api/spots') return Response.json({spots:payload().spots.slice(0,4),nextOffset:null});
    return new Response(null,{status:({'/api/session':401,'/api/account/claim':404,'/api/auth/get-session':403})[path]??200});
  };
  const result=await checkPreviewHttp(expected,request,false);
  assert.equal(result.serviceOnlyReadonly,true);
  assert.equal(result.emailSent,false);
  assert.equal(probes,1);
  await assert.rejects(checkPreviewHttp(expected,request,true),/catalog.identity_set/);
});
