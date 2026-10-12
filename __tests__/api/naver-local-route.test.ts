// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({limit:vi.fn(),runtime:vi.fn(),search:vi.fn()}));
vi.mock("@/lib/rate-limit",()=>({strictPlatformLimit:mocks.limit}));
vi.mock("@/lib/naver/local-search",async(importOriginal)=>({...(await importOriginal<typeof import("@/lib/naver/local-search")>()),referenceRuntime:mocks.runtime,searchLocalReferences:mocks.search}));
import { GET } from "@/app/api/places/naver-local/route";
import { ReferenceUnavailable } from "@/lib/naver/local-search";
const req=(query='city=seoul&name=Market')=>new NextRequest(`https://www.localley.io/api/places/naver-local?${query}`);
beforeEach(()=>{vi.clearAllMocks();mocks.limit.mockResolvedValue('ok');mocks.runtime.mockReturnValue({db:{},key:'private',keyId:'id'});mocks.search.mockResolvedValue({items:[],referenceOnly:true,cacheHit:true});});
it('returns only safe references with no-store/noindex',async()=>{
 const r=await GET(req());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('x-robots-tag')).toBe('noindex');
 expect(await r.json()).toEqual({items:[],referenceOnly:true,cacheHit:true});expect(mocks.limit).toHaveBeenCalledWith(expect.anything(),10,'naver-local');
});
it('invalid queries never touch the limiter, cache, or provider',async()=>{
 expect((await GET(req('city=tokyo&name=Market'))).status).toBe(400);expect(mocks.limit).not.toHaveBeenCalled();expect(mocks.search).not.toHaveBeenCalled();
});
it('fails closed for limiter denial or unavailability',async()=>{
 for(const [verdict,status] of [['limited',429],['unavailable',503]] as const){mocks.limit.mockResolvedValue(verdict);expect((await GET(req())).status).toBe(status);}
 expect(mocks.runtime).not.toHaveBeenCalled();expect(mocks.search).not.toHaveBeenCalled();
});
it('does not expose credentials or upstream errors',async()=>{
 mocks.search.mockRejectedValue(Error('private credential'));const r=await GET(req());expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'unavailable'});
 mocks.search.mockRejectedValue(new ReferenceUnavailable('daily_limit'));expect((await GET(req())).status).toBe(429);
});
