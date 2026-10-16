// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({reader: vi.fn(), user: vi.fn()}));
vi.mock("@/lib/app-data/preview-db", () => ({previewAppDataReader: mocks.reader}));
vi.mock("@/lib/auth/server", () => ({currentUser: mocks.user}));
import { previewItineraryEditor, PreviewEditorDeniedError } from "@/lib/app-data/preview-itinerary-editor";
import { updatePreviewItinerary } from "@/lib/app-data/preview-itinerary-update";
const id="00000000-0000-4000-8000-000000000011";
const activities={dailyPlans:[{day:1,theme:"Tea lanes",activities:[{name:"Ikseon tea house",description:"Quiet courtyard",time:"09:00",duration:"60 min",cost:"$10",address:"Seoul",type:"food",localleyScore:6,lat:37.57,lng:126.98,image:"https://owner.test/photo",custom:{kept:true}}]}],insights:[{id:"note",kind:"local",label:"Local note",text:"Ask about seasonal tea"}]};
let db:D1Sqlite;
function legacy(){db.sqlite.exec(`INSERT INTO owners VALUES('legacy-a','legacy-fixture');
 INSERT INTO legacy_import_batches(id,manifestSha256,projectionSha256,counts) VALUES('${'a'.repeat(64)}','${'b'.repeat(64)}','${'c'.repeat(64)}','{}');
 INSERT INTO legacy_owners VALUES('legacy-a','a',1,'${'a'.repeat(64)}');`);}
beforeEach(()=>{
 db=new D1Sqlite();for(const f of readdirSync('migrations/app-preview').filter(f=>f.endsWith('.sql')).sort())db.sqlite.exec(readFileSync('migrations/app-preview/'+f,'utf8'));
 db.sqlite.exec("INSERT INTO owners VALUES('auth:a','new'),('auth:b','new')");
 db.sqlite.prepare('INSERT INTO itineraries(id,ownerId,title,city,days,activities,highlights,estimated_cost,subtitle,local_score) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'auth:a','Private tea route','Seoul',1,JSON.stringify(activities),'["Quiet lanes"]','$50','Keep subtitle',6);
 mocks.reader.mockReturnValue(db);mocks.user.mockResolvedValue({id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}});
});
afterEach(()=>{db.sqlite.close();vi.clearAllMocks();});
describe('owned candidate editor data and writes',()=>{
 it('returns complete activity fields and notes without mutating the saved row',async()=>{
  const before=db.sqlite.prepare('SELECT * FROM itineraries').all();
  expect(await previewItineraryEditor(id,'a')).toMatchObject({id,title:'Private tea route',activities,estimated_cost:'$50'});
  expect(db.sqlite.prepare('SELECT * FROM itineraries').all()).toEqual(before);
 });
 it('denies invalid, missing, anonymous and foreign rows, including shared trips',async()=>{
  expect(await previewItineraryEditor('../bad','a')).toBeNull();expect(await previewItineraryEditor(id,null)).toBeNull();
  expect(await previewItineraryEditor('00000000-0000-4000-8000-000000000012','a')).toBeNull();
  db.sqlite.exec('UPDATE itineraries SET shared=1');mocks.user.mockResolvedValue({id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'b@preview.localley.test'}});
  expect(await previewItineraryEditor(id,'b')).toBeNull();
 });
 it('denies real, unverified, malformed and mismatched identities before database reads',async()=>{
  for(const user of [{id:'a',emailVerified:false,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},{id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},...['a@example.com','evil@other@preview.localley.test','a\n@preview.localley.test'].map(emailAddress=>({id:'a',emailVerified:true,primaryEmailAddress:{emailAddress}}))]){
   mocks.user.mockResolvedValue(user);expect(await previewItineraryEditor(id,'a')).toBeNull();
  }expect(mocks.reader).not.toHaveBeenCalled();
 });
 it('refuses legacy mapping for reads and writes',async()=>{
  legacy();expect(await previewItineraryEditor(id,'a')).toBeNull();
  await expect(updatePreviewItinerary(id,'a',{title:'New',city:'Seoul',activities,highlights:[],estimatedCost:null})).rejects.toBeInstanceOf(PreviewEditorDeniedError);
  expect(db.sqlite.prepare('SELECT title FROM itineraries').get().title).toBe('Private tea route');
 });
 it('updates owned editable fields while preserving metadata and unrelated trip fields',async()=>{
  const result=await updatePreviewItinerary(id,'a',{title:'Saved tea route',city:'Seoul',activities,highlights:['Tea'],estimatedCost:'$60'});
  expect(result.state).toBe('found');const row=db.sqlite.prepare('SELECT * FROM itineraries').get();
  expect(row).toMatchObject({title:'Saved tea route',estimated_cost:'$60',subtitle:'Keep subtitle',local_score:6});expect(JSON.parse(row.activities)).toEqual(activities);
  expect(await previewItineraryEditor(id,'a')).toMatchObject({title:'Saved tea route',activities});
 });
 it('refuses legacy mapping introduced immediately before the atomic update',async()=>{
  const prepare=db.prepare.bind(db);mocks.reader.mockReturnValue({prepare:(sql:string)=>{
   if(sql.startsWith('UPDATE itineraries SET'))legacy();return prepare(sql);
  }});
  expect(await updatePreviewItinerary(id,'a',{title:'Must not save',city:'Seoul',activities,highlights:[],estimatedCost:null})).toEqual({state:"forbidden"});
  expect(db.sqlite.prepare('SELECT title FROM itineraries').get().title).toBe('Private tea route');
 });
 it('rejects invalid or unrenderable data instead of dropping fields',async()=>{
  await expect(updatePreviewItinerary(id,'a',{title:'Tea',city:'Seoul',activities,highlights:Array(20).fill('\u0000'.repeat(200)),estimatedCost:null})).rejects.toThrow();
  for(const value of [{dailyPlans:[{day:2,activities:[]}]},{dailyPlans:[{day:1,activities:[{name:'Stop',cost:{secret:1}}]}]}, {dailyPlans:Array.from({length:31},()=>({day:1,activities:[]}))}]){
   db.sqlite.prepare('UPDATE itineraries SET activities=?').run(JSON.stringify(value));await expect(previewItineraryEditor(id,'a')).rejects.toThrow();
  }
 });
 it('fails closed when D1 is unavailable',async()=>{mocks.reader.mockImplementation(()=>{throw Error('private SQL failure');});await expect(previewItineraryEditor(id,'a')).rejects.toThrow();});
});
