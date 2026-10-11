// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks=vi.hoisted(()=>({reader:vi.fn(),user:vi.fn()}));
vi.mock("@/lib/app-data/preview-db",()=>({previewAppDataReader:mocks.reader}));
vi.mock("@/lib/auth/server",()=>({currentUser:mocks.user}));
import { previewItineraryExport } from "@/lib/app-data/preview-itinerary-export";
const id='00000000-0000-4000-8000-000000000001'; let db:D1Sqlite;
beforeEach(()=>{
  db=new D1Sqlite(); db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT); CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY,ownerId TEXT,title TEXT,city TEXT,days INTEGER,activities TEXT,highlights TEXT,estimated_cost TEXT,local_score REAL);
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');`);
  db.sqlite.prepare('INSERT INTO itineraries VALUES(?,?,?,?,?,?,?,?,?)').run(id,'auth:a','Owned trip','Seoul',1,
    JSON.stringify({dailyPlans:[{day:1,theme:'Food',activities:[{name:'Cafe',cost:'$5',duration:'1 hour'}]}],insights:[]}), '["Quiet lanes"]','$10',6);
  mocks.reader.mockReturnValue(db); mocks.user.mockResolvedValue({id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'A@preview.localley.test'}});
});
afterEach(()=>{db.sqlite.close();vi.clearAllMocks();});
describe('fresh-owner export repository',()=>{
  it('reads actual SQLite while preserving full cost/duration/itinerary payload',async()=>{
    const before=db.sqlite.prepare('SELECT * FROM itineraries').all();
    expect(await previewItineraryExport(id.toUpperCase(),'a')).toMatchObject({title:'Owned trip',clerk_user_id:'a',shared:false,
      estimated_cost:'$10',activities:{dailyPlans:[{activities:[{name:'Cafe',cost:'$5',duration:'1 hour'}]}]}});
    expect(db.sqlite.prepare('SELECT * FROM itineraries').all()).toEqual(before);
  });
  it('refuses other owners, invalid/missing IDs and historical conflicts',async()=>{
    expect(await previewItineraryExport('../private','a')).toBeNull();expect(mocks.reader).not.toHaveBeenCalled();
    expect(await previewItineraryExport('00000000-0000-4000-8000-000000000002','a')).toBeNull();
    mocks.user.mockResolvedValue({id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'b@preview.localley.test'}});
    expect(await previewItineraryExport(id,'b')).toBeNull();
    mocks.user.mockResolvedValue({id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}});
    db.sqlite.exec("INSERT INTO owners VALUES('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES('legacy-a','a');");
    expect(await previewItineraryExport(id,'a')).toBeNull();
  });
  it('refuses nonreserved, unverified or mismatched users before touching D1',async()=>{
    for(const user of [{id:'a',emailVerified:false,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},
      {id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'a@example.com'}},
      {id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}}]) {
      mocks.user.mockResolvedValue(user);expect(await previewItineraryExport(id,'a')).toBeNull();
    }
    expect(mocks.reader).not.toHaveBeenCalled();
  });
  it('refuses corrupt, incomplete and oversized schedules rather than exporting partial content',async()=>{
    for(const content of ['broken','{}',JSON.stringify([{day:2,activities:[{name:'Cafe'}]}]),
      JSON.stringify([{day:1,activities:[]}]),JSON.stringify([{day:1,activities:[{name:'x'.repeat(201)}]}]),'x'.repeat(65537)]) {
      db.sqlite.prepare('UPDATE itineraries SET activities=?').run(content);await expect(previewItineraryExport(id,'a')).rejects.toThrow();
    }
  });
  it('fails closed on unavailable D1 without writes',async()=>{
    const before=db.sqlite.prepare('SELECT * FROM itineraries').all(); mocks.reader.mockImplementation(()=>{throw Error('private failure');});
    await expect(previewItineraryExport(id,'a')).rejects.toThrow();expect(db.sqlite.prepare('SELECT * FROM itineraries').all()).toEqual(before);
  });
});
