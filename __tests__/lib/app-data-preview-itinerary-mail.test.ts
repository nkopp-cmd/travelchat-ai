// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { queuePreviewItineraryMail } from "@/lib/app-data/preview-itinerary-mail";
import { createMailSender, renderItineraryCopyMail } from "@/lib/auth/mail";
const environment = process.env, symbol = Symbol.for("__cloudflare-context__");
const id = "00000000-0000-4000-8000-000000000001";
let db: D1Sqlite, outbox: D1Sqlite;
beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true",
    BETTER_AUTH_URL: "https://localley-next-preview.nkopp.workers.dev" };
  db = new D1Sqlite(); outbox = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY,ownerId TEXT,title TEXT,city TEXT,days INTEGER,
      activities TEXT,subtitle TEXT,highlights TEXT,local_score REAL);
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');`);
  db.sqlite.prepare('INSERT INTO itineraries VALUES(?,?,?,?,?,?,?,?,?)').run(id,'auth:a','Private trip','Seoul',1,
    JSON.stringify([{day:1,activities:[{name:'Walk'}]}]),null,'[]',null);
  outbox.sqlite.exec('CREATE TABLE auth_mail_outbox(id INTEGER PRIMARY KEY,kind TEXT,email TEXT,url TEXT,createdAt INTEGER)');
  mocks.reader.mockReturnValue(db); mocks.user.mockResolvedValue({id:'a',emailVerified:true,
    primaryEmailAddress:{emailAddress:'A@preview.localley.test'}});
  Object.assign(globalThis,{[symbol]:{env:{AUTH_DB:outbox,AUTH_EMAIL:{send:mocks.send}}}});
});
afterEach(() => {db.sqlite.close();outbox.sqlite.close();process.env=environment;Reflect.deleteProperty(globalThis,symbol);vi.clearAllMocks();});
const count=()=>outbox.sqlite.prepare('SELECT count(*) AS n FROM auth_mail_outbox').get().n;
describe('candidate itinerary owner mail',()=>{
  it('queues an owned canonical detail link to the session recipient without a provider call',async()=>{
    expect(await queuePreviewItineraryMail('a',id.toUpperCase(),'A@preview.localley.test')).toBe(true);
    expect(outbox.sqlite.prepare('SELECT * FROM auth_mail_outbox').get()).toMatchObject({kind:'itinerary-copy',
      email:'a@preview.localley.test',url:`https://localley-next-preview.nkopp.workers.dev/itineraries/${id}?data_candidate=d1`});
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('refuses external or other-owner recipients before reading detail',async()=>{
    for(const email of ['real@example.com','b@preview.localley.test','a\n@preview.localley.test'])
      await expect(queuePreviewItineraryMail('a',id,email)).rejects.toThrow('recipient');
    expect(mocks.reader).not.toHaveBeenCalled();expect(count()).toBe(0);
  });
  it('refuses foreign, missing and legacy-owned content without writing',async()=>{
    mocks.user.mockResolvedValue({id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'b@preview.localley.test'}});
    expect(await queuePreviewItineraryMail('b',id,'b@preview.localley.test')).toBe(false);
    expect(await queuePreviewItineraryMail('b','00000000-0000-4000-8000-000000000002','b@preview.localley.test')).toBe(false);
    mocks.user.mockResolvedValue({id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}});
    db.sqlite.exec("INSERT INTO owners VALUES('old-a','legacy-fixture');INSERT INTO legacy_owners VALUES('old-a','a')");
    expect(await queuePreviewItineraryMail('a',id,'a@preview.localley.test')).toBe(false);expect(count()).toBe(0);
  });
  it('refuses invalid session identity and auth host or mail mode',async()=>{
    for(const user of [{id:'a',emailVerified:false,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},
      {id:'b',emailVerified:true,primaryEmailAddress:{emailAddress:'a@preview.localley.test'}},
      {id:'a',emailVerified:true,primaryEmailAddress:{emailAddress:'real@example.com'}}]) {
      mocks.user.mockResolvedValue(user);await expect(queuePreviewItineraryMail('a',id,'a@preview.localley.test')).rejects.toThrow();
    }
    process.env.BETTER_AUTH_URL='https://www.localley.io';
    await expect(queuePreviewItineraryMail('a',id,'a@preview.localley.test')).rejects.toThrow('outbox');
    expect(count()).toBe(0);expect(mocks.send).not.toHaveBeenCalled();
  });
  it('fails closed for invalid ID, corrupt detail, unavailable D1 and outbox failures',async()=>{
    await expect(queuePreviewItineraryMail('a','../other','a@preview.localley.test')).rejects.toThrow('ID');
    db.sqlite.exec("UPDATE itineraries SET highlights='{}'");
    await expect(queuePreviewItineraryMail('a',id,'a@preview.localley.test')).rejects.toThrow();
    db.sqlite.exec("UPDATE itineraries SET highlights='[]'");
    mocks.reader.mockImplementation(()=>{throw Error('Unavailable');});
    await expect(queuePreviewItineraryMail('a',id,'a@preview.localley.test')).rejects.toThrow();
    mocks.reader.mockReturnValue(db);Object.assign(globalThis,{[symbol]:{env:{AUTH_EMAIL:{send:mocks.send}}}});
    await expect(queuePreviewItineraryMail('a',id,'a@preview.localley.test')).rejects.toThrow('database');
    Object.assign(globalThis,{[symbol]:{env:{AUTH_DB:outbox}}});outbox.sqlite.exec('DROP TABLE auth_mail_outbox');
    await expect(queuePreviewItineraryMail('a',id,'a@preview.localley.test')).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('renders fixed HTML and text without private content, and preserves binding suppression handling',async()=>{
    const mail={kind:'itinerary-copy' as const,to:'a@example.com',url:'https://www.localley.io/itineraries/'+id};
    const rendered=renderItineraryCopyMail(mail);expect(rendered.text).toContain(mail.url);
    expect(rendered.html).toContain('View your itinerary');expect(rendered.subject).toBe('Your saved Localley itinerary');
    expect(JSON.stringify(rendered)).not.toContain('Private trip');
    process.env.AUTH_MAIL_MODE='cloudflare';process.env.FROM_EMAIL='Localley <hello@localley.io>';
    mocks.send.mockResolvedValue({messageId:'owned-message'});await createMailSender(undefined,{send:mocks.send})(mail);
    expect(mocks.send).toHaveBeenCalledWith({to:mail.to,from:{email:'hello@localley.io',name:'Localley'},...rendered});
    mocks.send.mockClear();mocks.send.mockRejectedValue({code:'E_RECIPIENT_SUPPRESSED',secret:'private'});
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    await expect(createMailSender(undefined,{send:mocks.send})(mail)).rejects.toThrow('could not be sent');
    expect(mocks.send).toHaveBeenCalledTimes(1);expect(JSON.stringify(log.mock.calls)).not.toContain('private');log.mockRestore();
  });
});
