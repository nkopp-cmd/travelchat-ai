import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateObject} from './cloudflare-media-upload.mjs';
test('R2 media upload rejects altered bytes, paths, content type and size',()=>{
  const bytes=Buffer.from([255,216,255,0]),sha256=createHash('sha256').update(bytes).digest('hex');
  const o={sha256,key:`legacy/${sha256}.jpg`,file:`objects/${sha256}.jpg`,contentType:'image/jpeg',bytes:4};
  assert.doesNotThrow(()=>validateObject(o,bytes));
  for(const change of [{file:'../../.env.local'},{key:'elsewhere/file.jpg'},{contentType:'image/png'},{bytes:5},{sha256:'0'.repeat(64)}])assert.throws(()=>validateObject({...o,...change},bytes));
  assert.throws(()=>validateObject(o,Buffer.from([255,216,255,1])));
});
