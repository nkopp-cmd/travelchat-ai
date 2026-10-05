// @vitest-environment node
import { createElement } from "react";
import { ImageResponse } from "next/og";
import { deflateSync, inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks=vi.hoisted(()=>({auth:vi.fn(),user:vi.fn(),source:vi.fn(),tier:vi.fn(),sourceTier:vi.fn(),weighted:vi.fn(),generate:vi.fn(),day:vi.fn(),available:vi.fn(),provider:vi.fn()}));
vi.mock("@/lib/auth/server",()=>({auth:mocks.auth,currentUser:mocks.user}));
vi.mock("@/lib/supabase",()=>({createSupabaseAdmin:mocks.source}));
vi.mock("@/lib/usage-tracking",()=>({getUserTier:mocks.sourceTier,checkAndIncrementUsageWeighted:mocks.weighted}));
vi.mock("@/lib/app-data/preview-user-tier",()=>({previewUserTier:mocks.tier}));
vi.mock("@/lib/rate-limit",()=>({rateLimit:()=>async()=>null}));
vi.mock("@/lib/flux",()=>({isFluxAvailable:()=>true}));
vi.mock("@/lib/seedream",()=>({isSeedreamAvailable:()=>true}));
vi.mock("@/lib/imagen",()=>({isImagenAvailable:()=>true}));
vi.mock("@/lib/image-provider",()=>({getImageProvider:mocks.provider,isAnyProviderAvailable:mocks.available,generateStoryBackground:mocks.generate,generateDayBackground:mocks.day}));
import { POST,GET } from "@/app/api/images/story-background/route";
import { PUT,DELETE } from "@/app/api/test-app-data/story-background/route";
import { GET as media } from "@/app/api/images/story-background/media/[id]/route";
import { backgroundCacheHash,cachedPreviewBackground,savePreviewBackground,previewBackgroundId,previewBackgroundData,previewBackgroundMime } from "@/lib/app-data/preview-story-background-cache";
import { incrementPreviewStoryUsage } from "@/lib/app-data/preview-story-usage";
import { updatePreviewStoryBackgrounds } from "@/lib/app-data/preview-story-metadata";
const symbol=Symbol.for("__cloudflare-context__"),original=process.env,host="localley-next-preview.nkopp.workers.dev";
let db:D1Sqlite;let objects:Map<string,Uint8Array>;let put:ReturnType<typeof vi.fn>;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(600)]);
const input={type:"cover" as const,city:"Owned preview",cacheKey:"fixture"};
const req=(body:unknown=input,hostname=host,flag=true)=>new NextRequest(`https://${hostname}/api/images/story-background${flag?"?data_candidate=d1":""}`,{method:"POST",body:JSON.stringify(body)});
function user(id="one"){mocks.auth.mockResolvedValue({userId:id});mocks.user.mockResolvedValue({id,emailVerified:true,primaryEmailAddress:{emailAddress:`${id}@preview.localley.test`}});}
beforeEach(()=>{
 vi.clearAllMocks();process.env={...original,AUTH_MAIL_MODE:"outbox",SUPABASE_READ_ONLY:"true"};
 vi.spyOn(console,"log").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});
 db=new D1Sqlite();db.sqlite.exec(`PRAGMA foreign_keys=ON; CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT);
 CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);
 CREATE TABLE legacy_import_batches(counts TEXT);
 CREATE TABLE legacy_usage(ownerId TEXT,usageType TEXT,periodType TEXT,periodStart TEXT,count INTEGER);
 INSERT INTO legacy_import_batches VALUES('{"legacy_usage":0}');
 CREATE TABLE itineraries(id TEXT PRIMARY KEY,ownerId TEXT);
 CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY,aiBackgrounds TEXT);`);
 db.sqlite.exec(readFileSync("migrations/app-preview/0028_preview_story_backgrounds.sql","utf8"));
 db.sqlite.exec(readFileSync("migrations/app-preview/0031_preview_story_background_capacity.sql","utf8"));
 objects=new Map();put=vi.fn(async(key:string,bytes:Uint8Array)=>{objects.set(key,new Uint8Array(bytes));return{key};});
 (globalThis as Record<symbol,unknown>)[symbol]={env:{APP_DATA_PREVIEW_DB:db,STORY_PREVIEW_MEDIA:{put,get:async(key:string)=>objects.has(key)?{arrayBuffer:async()=>new Uint8Array(objects.get(key)!).buffer}:null,delete:async(key:string)=>{objects.delete(key);}}}};
 user();mocks.provider.mockReturnValue("flux");mocks.tier.mockResolvedValue("pro");mocks.sourceTier.mockResolvedValue("pro");mocks.available.mockReturnValue(true);mocks.generate.mockResolvedValue(`data:image/png;base64,${png.toString("base64")}`);
});
afterEach(()=>{db.sqlite.close();process.env=original;delete(globalThis as Record<symbol,unknown>)[symbol];vi.restoreAllMocks();});
async function owner(){await db.prepare("INSERT OR IGNORE INTO owners VALUES('auth:one','new')").run();}
const usage=()=>db.sqlite.prepare("SELECT * FROM preview_story_usage").all() as {count:number;baselineCount:number}[];
describe("preview R2 background cache and atomic weighted usage",()=>{
 it("blocks real generation by default and rejects invalid bounded requests without source calls",async()=>{
  expect((await POST(req())).status).toBe(503);expect(mocks.generate).not.toHaveBeenCalled();expect(usage()).toEqual([]);
  for(const body of[{...input,ownerId:"other"},{...input,city:"x".repeat(20000)},{...input,provider:"bad"}])expect((await POST(req(body))).status).toBe(400);
  expect(previewBackgroundMime(png.subarray(0,499))).toBeNull();
  expect(mocks.source).not.toHaveBeenCalled();expect(mocks.weighted).not.toHaveBeenCalled();expect(mocks.sourceTier).not.toHaveBeenCalled();
 });
 it("stores actual byte format privately and cache hits preserve credits and skip tier/provider calls",async()=>{
  process.env.PREVIEW_STORY_GENERATION_ENABLED="true";
  const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(600)]);mocks.generate.mockResolvedValue(`data:image/png;base64,${jpeg.toString("base64")}`);
  const first=await POST(req());expect(first.status).toBe(200);expect(mocks.generate.mock.calls[0]?.at(-1)).toEqual({singleSubmission:true});const result=await first.json();expect(result).toMatchObject({success:true,cached:false,provider:"flux"});
  expect([...objects.keys()][0]).toMatch(/\.jpg$/);expect(usage()[0].count).toBe(1);
  mocks.tier.mockRejectedValue(new Error("must not need entitlement on owned cache hit"));
  const hit=await POST(req());expect(await hit.json()).toMatchObject({success:true,image:result.image,source:"cache",cached:true});
  expect(usage()[0].count).toBe(1);expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.source).not.toHaveBeenCalled();
  expect(await previewBackgroundData(result.image,"other")).toBeNull();
  const response=await media(new NextRequest(result.image),{params:Promise.resolve({id:previewBackgroundId(result.image)!})});
  expect(Buffer.from(await response.arrayBuffer())).toEqual(jpeg);expect(response.headers.get("content-type")).toBe("image/jpeg");
 });
 it("passes the submission boundary to candidate day backgrounds",async()=>{
  process.env.PREVIEW_STORY_GENERATION_ENABLED="true";mocks.day.mockResolvedValue(png.toString("base64"));
  expect((await POST(req({...input,type:"day",dayNumber:1,activities:["Controlled walk"]}))).status).toBe(200);
  expect(mocks.day.mock.calls[0]?.at(-1)).toEqual({singleSubmission:true});expect(mocks.generate).not.toHaveBeenCalled();
 });
 it("uses the selected model only and charges each automatic fallback its real weight",async()=>{
  process.env.PREVIEW_STORY_GENERATION_ENABLED="true";mocks.tier.mockResolvedValue("premium");mocks.generate.mockRejectedValueOnce(new Error("flux failed")).mockResolvedValueOnce(png.toString("base64"));
  expect((await POST(req())).status).toBe(200);expect(usage()[0].count).toBe(3);expect(mocks.generate.mock.calls.map(x=>x[0])).toEqual(["flux","seedream"]);
  user("two");mocks.tier.mockResolvedValue("premium");mocks.generate.mockRejectedValue(new Error("selected model failed"));
  await POST(req({...input,provider:"gemini"}));expect(mocks.generate.mock.calls.at(-1)?.[0]).toBe("gemini");
  expect(db.sqlite.prepare("SELECT count FROM preview_story_usage WHERE ownerId='auth:two'").get()).toEqual({count:3});
 });
 it("does not authorize Premium fallback models for a Pro candidate",async()=>{
  process.env.PREVIEW_STORY_GENERATION_ENABLED="true";mocks.tier.mockResolvedValue("pro");mocks.generate.mockRejectedValue(new Error("flux unavailable"));
  const r=await POST(req());expect(r.status).toBe(200);expect(await r.json()).toMatchObject({success:false});
  expect(mocks.generate.mock.calls.map(x=>x[0])).toEqual(["flux"]);expect(usage()[0].count).toBe(1);
  mocks.provider.mockReturnValue("seedream");mocks.generate.mockClear();await POST(req({...input,cacheKey:"pro-priority"}));
  expect(mocks.generate.mock.calls.map(x=>x[0])).toEqual(["flux"]);expect(usage()[0].count).toBe(2);
 });
 it("never treats WebP as PNG and does not retry generation after storage failure",async()=>{
  process.env.PREVIEW_STORY_GENERATION_ENABLED="true";mocks.generate.mockResolvedValue(Buffer.concat([Buffer.from("RIFFxxxxWEBP"),Buffer.alloc(600)]).toString("base64"));
  await POST(req({...input,provider:"flux"}));expect(put).not.toHaveBeenCalled();expect(mocks.generate).toHaveBeenCalledTimes(1);
  mocks.generate.mockResolvedValue(png.toString("base64"));put.mockRejectedValue(new Error("R2 failure"));
  const response=await POST(req({...input,cacheKey:"failure"}));expect(response.status).toBe(503);expect(mocks.generate).toHaveBeenCalledTimes(2);expect(mocks.source).not.toHaveBeenCalled();
 });
 it("atomically enforces concurrent weighted caps, isolates owners and rolls months without resetting old counts",async()=>{
  await owner();const now=new Date("2026-10-03T00:00:00Z");const results=await Promise.all(Array.from({length:10},()=>incrementPreviewStoryUsage("auth:one",3,6,now)));
  expect(results.filter(x=>x.allowed)).toHaveLength(2);expect(usage()[0].count).toBe(6);
  expect((await incrementPreviewStoryUsage("auth:one",1,6,now)).allowed).toBe(false);
  expect((await incrementPreviewStoryUsage("auth:one",2,6,new Date("2026-11-01T00:00:00Z"))).currentUsage).toBe(2);
  expect(usage().map(x=>x.count)).toEqual([6,2]);
 });
 it("preserves imported monthly baseline and refuses changed, duplicate or incomplete source usage",async()=>{
  await owner();db.sqlite.exec(`INSERT INTO legacy_usage VALUES('auth:one','ai_images_generated','monthly','2026-10-01',4);UPDATE legacy_import_batches SET counts='{"legacy_usage":1}';`);
  expect(await incrementPreviewStoryUsage("auth:one",2,6,new Date("2026-10-03"))).toMatchObject({allowed:true,currentUsage:6});
  expect((await incrementPreviewStoryUsage("auth:one",1,6,new Date("2026-10-03"))).allowed).toBe(false);
  db.sqlite.exec("UPDATE legacy_usage SET count=3");await expect(incrementPreviewStoryUsage("auth:one",1,6,new Date("2026-10-03"))).rejects.toThrow();
  db.sqlite.exec("INSERT INTO legacy_usage SELECT * FROM legacy_usage");await expect(incrementPreviewStoryUsage("auth:one",1,6,new Date("2026-10-03"))).rejects.toThrow();
 });
 it("deduplicates concurrent cache writes without overwriting objects and detects missing/corrupt bytes",async()=>{
  await owner();const hash=backgroundCacheHash(input);const images=await Promise.all([savePreviewBackground("auth:one",hash,png),savePreviewBackground("auth:one",hash,png)]);
  expect(images[0]).toBe(images[1]);expect(objects.size).toBe(1);
  const key=[...objects.keys()][0];objects.set(key,new Uint8Array(700));await expect(cachedPreviewBackground("auth:one",hash)).rejects.toThrow();
  objects.delete(key);await expect(cachedPreviewBackground("auth:one",hash)).rejects.toThrow();
 });
 it("retains a unique object on ambiguous metadata reply and refuses another paid attempt",async()=>{
  await owner();const originalPrepare=db.prepare.bind(db);vi.spyOn(db,"prepare").mockImplementation(sql=>{
    const stmt=originalPrepare(sql);if(sql.includes("INSERT OR IGNORE INTO preview_story_backgrounds")){const bind=stmt.bind.bind(stmt);stmt.bind=(...args:unknown[])=>{const s=bind(...args);s.run=async()=>{throw new Error("lost metadata reply");};return s;};}return stmt;});
  await expect(savePreviewBackground("auth:one",backgroundCacheHash(input),png)).rejects.toThrow();expect(objects.size).toBe(1);
 });
 it("proves fixed no-provider fixture quota, owner-only linking/media/cleanup and no source writes",async()=>{
  const make=()=>new NextRequest(`https://${host}/api/test-app-data/story-background?data_candidate=d1&cacheKey=fixture`,{method:"PUT",body:png});
  const result=await (await PUT(make())).json();expect(result.usage.currentUsage).toBe(3);
  expect((await PUT(make())).status).toBe(200);expect((await PUT(make())).status).toBe(429);
  db.sqlite.exec("INSERT INTO itineraries VALUES('trip','auth:one');INSERT INTO legacy_itinerary_media VALUES('trip','{}');");
  expect(await updatePreviewStoryBackgrounds("trip","one",{cover:result.image})).toEqual({cover:result.image});
  user("two");await owner();await expect(updatePreviewStoryBackgrounds("trip","two",{cover:result.image})).rejects.toThrow();
  const denied=await DELETE(new NextRequest(`https://${host}/api/test-app-data/story-background?data_candidate=d1&image=${encodeURIComponent(result.image)}`,{method:"DELETE"}));expect(await denied.json()).toEqual({deleted:false});
  user();const deleted=await DELETE(new NextRequest(`https://${host}/api/test-app-data/story-background?data_candidate=d1&image=${encodeURIComponent(result.image)}`,{method:"DELETE"}));expect(await deleted.json()).toEqual({deleted:true});expect(objects.size).toBe(0);
  expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.source).not.toHaveBeenCalled();
 });
 it("preserves normal www provider upload, byte detection and source quota",async()=>{
  const upload=vi.fn(async()=>({error:null}));
  const getPublicUrl=vi.fn(()=>({data:{publicUrl:"https://source.supabase.co/storage/v1/object/public/generated-images/normal.jpg"}}));
  const from=vi.fn(()=>({upload,getPublicUrl}));mocks.source.mockReturnValue({storage:{from}});
  mocks.weighted.mockResolvedValue({allowed:true,usage:{}});
  const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(600)]);
  mocks.generate.mockResolvedValue(`data:image/png;base64,${jpeg.toString("base64")}`);
  const response=await POST(req({...input,cacheKey:undefined,provider:"flux"},"www.localley.io",true));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({success:true,source:"ai",provider:"flux"});
  expect(upload).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/),jpeg,{contentType:"image/jpeg",upsert:true});
  expect(mocks.weighted).toHaveBeenCalledWith("one","ai_images_generated",1);
  expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.generate.mock.calls[0]?.at(-1)).toBeUndefined();expect(put).not.toHaveBeenCalled();expect(usage()).toEqual([]);
 });
 it("keeps normal preview/www on source and rejects anonymous candidate callers",async()=>{
  mocks.available.mockReturnValue(false);
  for(const [hostname,flag]of[[host,false],["www.localley.io",true]]as const){const r=await POST(req({...input,cacheKey:undefined},hostname,flag));expect(r.headers.get("x-localley-data-source")).toBeNull();}
  expect(mocks.sourceTier).toHaveBeenCalledTimes(2);
  mocks.auth.mockResolvedValue({userId:null});expect((await POST(req())).status).toBe(401);
  expect((await GET(new NextRequest(`https://${host}/api/images/story-background?data_candidate=d1`))).status).toBe(200);
 });
});

// A real RGB PNG with uncompressed scanlines, not a header plus padding fixture.
function fullSizePng() {
 const crc=(data:Buffer)=>{let value=0xffffffff;for(const byte of data){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;};
 const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);};
 const width=1080,height=1920,scanlines=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){for(let x=0;x<width;x++){const at=y*(width*3+1)+1+x*3;scanlines[at]=(x+y)%256;scanlines[at+1]=x%256;scanlines[at+2]=y%256;}}
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const compressed=deflateSync(scanlines,{level:0});expect(inflateSync(compressed).equals(scanlines)).toBe(true);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",compressed),chunk("IEND",Buffer.alloc(0))]);
}
it("stores and renders a valid full-size PNG above the old cap while retaining bounded refusals",async()=>{
 await owner();const bytes=fullSizePng(),cacheHash="a".repeat(64);expect(bytes.length).toBeGreaterThan(2*1024*1024);expect(bytes.length).toBeLessThan(8*1024*1024);
 const url=await savePreviewBackground("auth:one",cacheHash,bytes);expect(await cachedPreviewBackground("auth:one",cacheHash)).toBe(url);
 const read=await previewBackgroundData(url,"one");expect(Buffer.from(read!.bytes).equals(bytes)).toBe(true);expect(read!.contentType).toBe("image/png");expect(await previewBackgroundData(url,"foreign")).toBeNull();
 expect(db.sqlite.prepare("SELECT byteSize,sha256 FROM preview_story_backgrounds").get()).toEqual({byteSize:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
 const rendered=Buffer.from(await new ImageResponse(createElement("div",{style:{display:"flex",width:"100%",height:"100%"}},createElement("img",{src:`data:image/png;base64,${bytes.toString("base64")}`,width:1080,height:1920})),{width:1080,height:1920}).arrayBuffer());
 expect(rendered.subarray(0,8)).toEqual(bytes.subarray(0,8));expect(rendered.readUInt32BE(16)).toBe(1080);expect(rendered.readUInt32BE(20)).toBe(1920);
 const before=objects.size;await expect(savePreviewBackground("auth:one","b".repeat(64),Buffer.concat([bytes,Buffer.alloc(8*1024*1024+1-bytes.length)]))).rejects.toThrow();
 const webp=Buffer.concat([Buffer.from("RIFFxxxxWEBP"),Buffer.alloc(3*1024*1024)]);expect(previewBackgroundMime(webp)).toBeNull();expect(objects.size).toBe(before);
},15000);
it("migrates populated candidate metadata without changing values, uniqueness or ownership constraints",()=>{
 const prior=new D1Sqlite();try{prior.sqlite.exec("PRAGMA foreign_keys=ON;CREATE TABLE owners(id TEXT PRIMARY KEY);INSERT INTO owners VALUES('old')");prior.sqlite.exec(readFileSync("migrations/app-preview/0028_preview_story_backgrounds.sql","utf8"));
 prior.sqlite.prepare("INSERT INTO preview_story_backgrounds VALUES(?,?,?,?,?,?,?)").run("old-id","old","a".repeat(64),"story-backgrounds/old.png","image/png",2097152,"b".repeat(64));
 const before=prior.sqlite.prepare("SELECT * FROM preview_story_backgrounds").all();prior.sqlite.exec("BEGIN;"+readFileSync("migrations/app-preview/0031_preview_story_background_capacity.sql","utf8")+"COMMIT;");expect(prior.sqlite.prepare("SELECT * FROM preview_story_backgrounds").all()).toEqual(before);
 const insert=prior.sqlite.prepare("INSERT INTO preview_story_backgrounds VALUES(?,?,?,?,?,?,?)");
 for(const [id,ownerId,cacheHash,key,mime,size]of[["duplicate","old","a".repeat(64),"different","image/png",600],["orphan","foreign","c".repeat(64),"orphan","image/png",600],["oversize","old","d".repeat(64),"big","image/png",8388609],["webp","old","e".repeat(64),"webp","image/webp",600]]as const)expect(()=>insert.run(id,ownerId,cacheHash,key,mime,size,"f".repeat(64))).toThrow();
 insert.run("large","old","c".repeat(64),"large","image/png",8388608,"f".repeat(64));expect(prior.sqlite.prepare("SELECT count(*) AS n FROM preview_story_backgrounds").get()).toEqual({n:2});prior.sqlite.exec("DELETE FROM owners WHERE id='old'");expect(prior.sqlite.prepare("SELECT count(*) AS n FROM preview_story_backgrounds").get()).toEqual({n:0});
 }finally{prior.sqlite.close();}
});
