// @vitest-environment node
import {readFileSync,readdirSync} from "node:fs";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {D1Sqlite} from "@/__tests__/helpers/d1-sqlite";
const mocks=vi.hoisted(()=>({reader:vi.fn(),user:vi.fn()}));
vi.mock("@/lib/app-data/preview-db",()=>({previewAppDataReader:mocks.reader}));
vi.mock("@/lib/auth/server",()=>({currentUser:mocks.user}));
import {deletePreviewItinerary} from "@/lib/app-data/preview-itinerary-delete";
import {PreviewEditorDeniedError} from "@/lib/app-data/preview-itinerary-editor";
const id="550e8400-e29b-41d4-a716-446655440000",other="550e8400-e29b-41d4-a716-446655440001";
let db:D1Sqlite;
const user=(id="a")=>({id,emailVerified:true,primaryEmailAddress:{emailAddress:id+"@preview.localley.test"}});
const snapshot=()=>["itineraries","legacy_itinerary_media","conversations","messages","preview_itinerary_likes"].map(t=>db.sqlite.prepare('SELECT * FROM "'+t+'" ORDER BY 1').all());
function legacy(){db.sqlite.exec(`INSERT INTO legacy_import_batches(id,manifestSha256,projectionSha256,counts)
 VALUES('${"a".repeat(64)}','${"b".repeat(64)}','${"c".repeat(64)}','{}');
 INSERT INTO owners VALUES('legacy-a','legacy-fixture');INSERT INTO legacy_owners VALUES('legacy-a','a',1,'${"a".repeat(64)}');`);}
beforeEach(()=>{
 db=new D1Sqlite();for(const file of readdirSync("migrations/app-preview").filter(f=>f.endsWith(".sql")).sort())db.sqlite.exec(readFileSync("migrations/app-preview/"+file,"utf8"));
 db.sqlite.exec(`PRAGMA foreign_keys=ON;INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');
 INSERT INTO itineraries(id,ownerId,title,city,days,activities,shared)VALUES('${id}','auth:a','Tea route','Seoul',1,'[]',1),('${other}','auth:b','Other route','Seoul',1,'[]',0);
 INSERT INTO legacy_itinerary_media(itineraryId,isPublic)VALUES('${id}',1);
 INSERT INTO conversations VALUES('00000000-0000-4000-8000-000000000001','auth:a','Keep history','${id}','2026-01-01','2026-01-01');
 INSERT INTO messages VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','user','Keep message','2026-01-01');
 INSERT INTO preview_itinerary_likes VALUES('auth:b','${id}','2026-01-01');`);
 // The shared shim deliberately lacks transactions. This verifier executes actual statements sequentially inside SQLite BEGIN/COMMIT.
 const batch=db.batch.bind(db);vi.spyOn(db,"batch").mockImplementation(async statements=>{
  db.sqlite.exec("BEGIN");try{const results=await batch(statements);db.sqlite.exec("COMMIT");return results;}catch(e){db.sqlite.exec("ROLLBACK");throw e;}
 });mocks.reader.mockReturnValue(db);mocks.user.mockResolvedValue(user());
});
afterEach(()=>{db.sqlite.close();vi.restoreAllMocks();vi.clearAllMocks();});
describe("fresh-owner candidate trip deletion",()=>{
 it("deletes only the owned trip and empty metadata, cascades likes, retains messages and unlinks history",async()=>{
  const message=db.sqlite.prepare("SELECT * FROM messages").all(),foreign=db.sqlite.prepare("SELECT * FROM itineraries WHERE id=?").get(other);
  expect(await deletePreviewItinerary(id.toUpperCase(),"a")).toBe("deleted");
  expect(db.sqlite.prepare("SELECT * FROM itineraries WHERE id=?").get(id)).toBeUndefined();
  expect(db.sqlite.prepare("SELECT * FROM legacy_itinerary_media").all()).toEqual([]);expect(db.sqlite.prepare("SELECT * FROM preview_itinerary_likes").all()).toEqual([]);
  expect(db.sqlite.prepare("SELECT * FROM messages").all()).toEqual(message);expect(db.sqlite.prepare("SELECT linkedItineraryId,title FROM conversations").get()).toEqual({linkedItineraryId:null,title:"Keep history"});
  expect(db.sqlite.prepare("SELECT * FROM itineraries WHERE id=?").get(other)).toEqual(foreign);expect(db.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  const after=snapshot();expect(await deletePreviewItinerary(id,"a")).toBe("missing");expect(snapshot()).toEqual(after);
 });
 it.each(["aiBackgrounds","storySlides"])("refuses attached %s without any link/metadata mutation",async field=>{
  db.sqlite.exec(`UPDATE legacy_itinerary_media SET ${field}='{}'`);const before=snapshot();expect(await deletePreviewItinerary(id,"a")).toBe("forbidden");expect(snapshot()).toEqual(before);
 });
 it("refuses foreign public and private trips without changes",async()=>{
  mocks.user.mockResolvedValue(user("b"));let before=snapshot();expect(await deletePreviewItinerary(id,"b")).toBe("forbidden");expect(snapshot()).toEqual(before);
  db.sqlite.exec("UPDATE legacy_itinerary_media SET isPublic=0");before=snapshot();expect(await deletePreviewItinerary(id,"b")).toBe("forbidden");expect(snapshot()).toEqual(before);
 });
 it("returns missing for invalid or absent ids without preparing a batch",async()=>{
  const before=snapshot();expect(await deletePreviewItinerary("../bad","a")).toBe("missing");expect(await deletePreviewItinerary("00000000-0000-4000-8000-000000000099","a")).toBe("missing");expect(snapshot()).toEqual(before);expect(db.batch).not.toHaveBeenCalled();
 });
 it.each([null,{...user(),emailVerified:false},{...user(),primaryEmailAddress:{emailAddress:"a@example.com"}},user("b")])("denies unverified or non-reserved actors",async actor=>{
  mocks.user.mockResolvedValue(actor);const before=snapshot();await expect(deletePreviewItinerary(id,"a")).rejects.toBeInstanceOf(PreviewEditorDeniedError);expect(snapshot()).toEqual(before);
 });
 it("refuses a preexisting legacy identity mapping",async()=>{
  legacy();const before=snapshot();await expect(deletePreviewItinerary(id,"a")).rejects.toBeInstanceOf(PreviewEditorDeniedError);expect(snapshot()).toEqual(before);
 });
 it.each(["owner","legacy","media"])("rechecks a %s change immediately before the batch",async mode=>{
  const batch=db.batch.bind(db);let expected:unknown;vi.spyOn(db,"batch").mockImplementationOnce(async statements=>{
   if(mode==="owner")db.sqlite.exec("UPDATE itineraries SET ownerId='auth:b' WHERE id='"+id+"'");
   if(mode==="legacy")legacy();if(mode==="media")db.sqlite.exec("UPDATE legacy_itinerary_media SET storySlides='{}'");expected=snapshot();return batch(statements);
  });expect(await deletePreviewItinerary(id,"a")).toBe("forbidden");expect(snapshot()).toEqual(expected);
 });
 it("rolls back link and metadata mutations when the final delete fails",async()=>{
  db.sqlite.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON itineraries BEGIN SELECT RAISE(ABORT,'controlled failure'); END;`);const before=snapshot();
  await expect(deletePreviewItinerary(id,"a")).rejects.toThrow("controlled failure");expect(snapshot()).toEqual(before);
 });
});
