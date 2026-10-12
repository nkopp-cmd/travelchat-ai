// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { localQuery, searchLocalReferences } from "@/lib/naver/local-search";

class TransactionalDb extends D1Sqlite {
  private tail: Promise<unknown> = Promise.resolve();
  override async batch(statements: Parameters<D1Sqlite["batch"]>[0]) {
    const next = this.tail.then(async () => {
      this.sqlite.exec("BEGIN");
      try { const rows = []; for (const statement of statements) rows.push(await statement.all());
        this.sqlite.exec("COMMIT"); return rows;
      } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
    });
    this.tail = next.catch(() => {}); return next;
  }
}
let db: TransactionalDb;
const now = Date.parse("2026-10-12T12:00:00Z"), day = "2026-10-12";
const item = { title: "<b>광장시장</b>", address: "서울 종로구", roadAddress: "서울 창경궁로 88", category: "시장", link: "https://example.com/place" };
const response = () => Response.json({ items: [item] });
const args = () => ({ db, city: "seoul", name: "광장시장", keyId: "id", key: "key", now });
beforeEach(() => { db = new TransactionalDb(); db.sqlite.exec(readFileSync("migrations/references/0001_naver_local.sql", "utf8")); });
afterEach(() => { db.sqlite.close(); vi.restoreAllMocks(); });
it("normalizes queries and refuses non-KR or unsafe names", () => {
 expect(localQuery("SEOUL", "  광장시장  ")).toBe("서울 광장시장");
 expect(localQuery("seoul", "ＡＢＣ")).toBe("서울 abc");
 for (const [city,name] of [["constructor","cafe"],["__proto__","cafe"],["tokyo","cafe"],["seoul","x"],["seoul","<script>"],["seoul","a".repeat(101)]]) expect(() => localQuery(city,name)).toThrow("invalid_query");
});
it("uses the real SQLite cache, safe reference fields, and one call for seven days", async () => {
 const request = vi.fn().mockImplementation(response);
 const first = await searchLocalReferences({ ...args(), request });
 expect(first).toMatchObject({ cacheHit: false, referenceOnly: true, items: [{ name: "광장시장", address: item.address, sourceUrl: item.link }] });
 expect(first.items[0]).not.toHaveProperty("description"); expect(first.items[0]).not.toHaveProperty("verified");
 const [url,options] = request.mock.calls[0]; expect(url.origin).toBe("https://naverapihub.apigw.ntruss.com");
 expect(options.redirect).toBe("error"); expect(options.headers["X-NCP-APIGW-API-KEY"]).toBe("key");
 expect(await searchLocalReferences({ ...args(), now: now + 6 * 86400000, request })).toMatchObject({ cacheHit: true });
 expect(request).toHaveBeenCalledTimes(1); expect(db.sqlite.prepare("SELECT calls FROM naver_daily_budget WHERE day=?").get(day)).toEqual({ calls: 1 });
 await searchLocalReferences({ ...args(), now: now + 7 * 86400000, request }); expect(request).toHaveBeenCalledTimes(2);
});
it("replaces unsafe or empty source URLs with the exact Naver map search", async () => {
 const r = await searchLocalReferences({ ...args(), request: vi.fn().mockResolvedValue(Response.json({ items: [{ ...item, link: "javascript:alert(1)" }] })) });
 expect(r.items[0].sourceUrl).toMatch(/^https:\/\/map\.naver\.com\/p\/search\//);
});
it("holds provider failures and unknown outcomes for seven days without retries", async () => {
 for (const name of ["bad status","network error","malformed","oversize"]) {
  const request = vi.fn().mockImplementation(() => {
   if (name === "network error") throw Error("secret provider detail");
   return name === "bad status" ? new Response("secret",{status:500}) : name === "malformed" ? Response.json({oops: true}) : new Response("x".repeat(65537));
  });
  await expect(searchLocalReferences({ ...args(),name,request })).rejects.toThrow("unavailable");
  await expect(searchLocalReferences({ ...args(),name,request,now: now + 86400000 })).rejects.toThrow("unavailable");
  expect(request).toHaveBeenCalledTimes(1);
 }
 expect(db.sqlite.prepare("SELECT calls FROM naver_daily_budget").get()).toEqual({calls:4});
});
it("concurrent identical calls reserve and request only once", async () => {
 let release!: (r:Response)=>void; const request = vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{release=resolve;}));
 const first=searchLocalReferences({...args(),request});
 await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
 const other=await Promise.allSettled(Array.from({length:8},()=>searchLocalReferences({...args(),request})));
 expect(other.every(x=>x.status==='rejected')).toBe(true);expect(request).toHaveBeenCalledTimes(1);
 release(response());await first;expect(db.sqlite.prepare('SELECT calls FROM naver_daily_budget').get()).toEqual({calls:1});
});
it("atomic last-slot admission stops at 2000 and admits a fresh UTC day", async () => {
 db.sqlite.exec("INSERT INTO naver_daily_budget VALUES('2026-10-12',1999)");
 const request=vi.fn().mockImplementation(response);
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>searchLocalReferences({...args(),name:`Cafe ${i}`,request})));
 expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(request).toHaveBeenCalledTimes(1);
 expect(db.sqlite.prepare('SELECT calls FROM naver_daily_budget WHERE day=?').get(day)).toEqual({calls:2000});
 await expect(searchLocalReferences({...args(),name:'another cafe',request})).rejects.toThrow('daily_limit');
 expect(request).toHaveBeenCalledTimes(1);
 await searchLocalReferences({...args(),name:'another cafe',request,now:Date.parse('2026-10-13T00:00:00Z')});expect(request).toHaveBeenCalledTimes(2);
});
it("storage reservation faults roll back both claim and quota before the provider", async () => {
 db.sqlite.exec("CREATE TRIGGER reject_budget BEFORE INSERT ON naver_daily_budget BEGIN SELECT RAISE(ABORT,'budget failed'); END");
 const request=vi.fn().mockImplementation(response);
 await expect(searchLocalReferences({...args(),request})).rejects.toThrow();expect(request).not.toHaveBeenCalled();
 expect(db.sqlite.prepare('SELECT count(*) AS n FROM naver_local_cache').get()).toEqual({n:0});
});
it("an uncertain cache write keeps the original pending hold and never repeats", async () => {
 db.sqlite.exec("CREATE TRIGGER reject_write BEFORE UPDATE ON naver_local_cache BEGIN SELECT RAISE(ABORT,'cache failed'); END");
 const request=vi.fn().mockImplementation(response);
 await expect(searchLocalReferences({...args(),request})).rejects.toThrow('unavailable');
 await expect(searchLocalReferences({...args(),request})).rejects.toThrow('unavailable');expect(request).toHaveBeenCalledTimes(1);
});
it("missing keys prevent storage and provider work", async () => {
 const request=vi.fn();await expect(searchLocalReferences({...args(),key:'',request})).rejects.toThrow('unavailable');
 expect(request).not.toHaveBeenCalled();expect(db.sqlite.prepare('SELECT count(*) AS n FROM naver_local_cache').get()).toEqual({n:0});
});
