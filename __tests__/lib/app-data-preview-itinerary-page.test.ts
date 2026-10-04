// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { previewItineraryPage } from "@/lib/app-data/preview-itinerary-page";
const id = "00000000-0000-4000-8000-000000000001";
let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY,ownerId TEXT,title TEXT,city TEXT,days INTEGER,
      activities TEXT,subtitle TEXT,highlights TEXT,local_score REAL);
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');`);
  db.sqlite.prepare('INSERT INTO itineraries VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'auth:a', 'Owned trip', 'Seoul', 1,
    JSON.stringify([{day:1,theme:'Local food',activities:[{name:'Walk',time:'09:00',description:'Owned stop',
      image:'https://paid.test/image',thumbnail:'https://private.test/thumb'}]}]),null,'["Quiet lanes"]',6);
  mocks.reader.mockReturnValue(db);
  mocks.user.mockResolvedValue({ id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'A@preview.localley.test'} });
});
afterEach(() => { db.sqlite.close(); vi.clearAllMocks(); });
describe('private candidate itinerary page data', () => {
  it('reads owned real SQLite data with display normalization and excludes image/provider payloads', async () => {
    const value = await previewItineraryPage(id.toUpperCase(),'a');
    expect(value).toMatchObject({ownerEmail:'a@preview.localley.test',id,title:'Owned trip',city:'Seoul',days:1,highlights:['Quiet lanes'],
      dailyPlans:[{day:1,theme:'Local food',activities:[{name:'Walk',time:'09:00',description:'Owned stop'}]}]});
    expect(JSON.stringify(value)).not.toMatch(/paid\.test|private\.test|thumbnail/);
  });
  it('refuses anonymous, invalid and missing IDs without leaking rows', async () => {
    expect(await previewItineraryPage(id,null)).toBeNull();
    expect(await previewItineraryPage('../private','a')).toBeNull();
    expect(mocks.reader).not.toHaveBeenCalled();
    expect(await previewItineraryPage('00000000-0000-4000-8000-000000000002','a')).toBeNull();
  });
  it('refuses a different verified owner', async () => {
    mocks.user.mockResolvedValue({id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'b@preview.localley.test'}});
    expect(await previewItineraryPage(id,'b')).toBeNull();
  });
  it('refuses real, unverified, malformed and mismatched identities before DB reads', async () => {
    for (const user of [{id:'a',emailVerified:false,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},
      {id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},
      ...['a@example.com','evil@other@preview.localley.test','a\n@preview.localley.test']
        .map(emailAddress=>({id:'a',emailVerified:true,primaryEmailAddress:{emailAddress}}))]) {
      mocks.user.mockResolvedValue(user); expect(await previewItineraryPage(id,'a')).toBeNull();
    }
    expect(mocks.reader).not.toHaveBeenCalled();
  });
  it('refuses conflicting historical identity despite an owned fresh row', async () => {
    db.sqlite.exec("INSERT INTO owners VALUES('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES('legacy-a','a');");
    expect(await previewItineraryPage(id,'a')).toBeNull();
  });
  it('refuses foreign historical mapping on the fresh owner', async () => {
    db.sqlite.exec("INSERT INTO legacy_owners VALUES('auth:a','other');");
    expect(await previewItineraryPage(id,'a')).toBeNull();
  });
  it('rejects malformed and excessive schedules or highlights rather than serving partial content', async () => {
    for(const [field,value] of [['activities','broken'],['activities','x'.repeat(65537)],['highlights','{}'],
      ['highlights',JSON.stringify(['x'.repeat(301)])],['activities',JSON.stringify([{day:2,activities:[]}])],
      ['activities',JSON.stringify([{day:1,activities:Array.from({length:51},()=>({name:'Stop'}))}])]] as const) {
      const before=db.sqlite.prepare(`SELECT ${field} AS value FROM itineraries`).get().value;
      db.sqlite.prepare(`UPDATE itineraries SET ${field}=?`).run(value);
      await expect(previewItineraryPage(id,'a')).rejects.toThrow();
      db.sqlite.prepare(`UPDATE itineraries SET ${field}=?`).run(before);
    }
  });
  it('fails closed when D1 is unavailable without mutating any rows', async () => {
    const before=db.sqlite.prepare('SELECT * FROM itineraries').all();
    mocks.reader.mockImplementation(()=>{throw Error('private failure');});
    await expect(previewItineraryPage(id,'a')).rejects.toThrow();
    expect(db.sqlite.prepare('SELECT * FROM itineraries').all()).toEqual(before);
  });
});
