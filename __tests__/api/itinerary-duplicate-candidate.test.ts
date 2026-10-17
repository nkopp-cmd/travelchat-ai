import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({auth:vi.fn(),copy:vi.fn(),server:vi.fn(),admin:vi.fn()}));
vi.mock("@/lib/auth/server",()=>({auth:m.auth}));
vi.mock("@/lib/app-data/preview-itinerary-duplicate",()=>({duplicatePreviewItinerary:m.copy}));
vi.mock("@/lib/supabase-server",()=>({createSupabaseServerClient:m.server}));
vi.mock("@/lib/supabase",()=>({createSupabaseAdmin:m.admin}));
import { POST } from "@/app/api/itineraries/[id]/duplicate/route";
import { PreviewEditorDeniedError } from "@/lib/app-data/preview-itinerary-editor";
const env=process.env,host="localley-next-preview.nkopp.workers.dev";
const request=(hostname=host,flag="?data_candidate=d1",actor?:string)=>POST(new NextRequest(`https://${hostname}/api/itineraries/trip/duplicate${flag}`,
  {method:"POST",headers:actor?{"X-Localley-Preview-Actor":actor}:{}}),{params:Promise.resolve({id:"trip"})});
beforeEach(()=>{process.env={...env,AUTH_MAIL_MODE:"outbox",SUPABASE_READ_ONLY:"true"};
  m.auth.mockResolvedValue({userId:"a"});m.copy.mockResolvedValue({state:"found",itinerary:{id:"copy",clerk_user_id:"a",shared:false}});
  m.server.mockResolvedValue({});m.admin.mockReturnValue({from:()=>({select:()=>({eq:()=>({single:async()=>({data:null})})})})});});
afterEach(()=>{process.env=env;vi.clearAllMocks();});
describe("candidate duplicate route",()=>{
  it("returns the private copy with no-store and no Source calls",async()=>{
    const r=await request();expect(r.status).toBe(200);expect(await r.json()).toEqual({id:"copy",clerk_user_id:"a",shared:false});
    expect(r.headers.get("Cache-Control")).toBe("no-store");expect(r.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(m.copy).toHaveBeenCalledWith("trip","a");expect(m.server).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
  });
  it.each(["missing","forbidden"])("returns %s without Source fallback",async state=>{
    m.copy.mockResolvedValue({state});const r=await request();expect(r.status).toBe(state==="missing"?404:403);
    expect(m.server).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
  });
  it("refuses actor mismatch before all data access",async()=>{expect((await request(host,"?data_candidate=d1","b")).status).toBe(403);
    expect(m.copy).not.toHaveBeenCalled();expect(m.server).not.toHaveBeenCalled();});
  it("refuses signed-out users before any database",async()=>{m.auth.mockResolvedValue({userId:null});
    expect((await request()).status).toBe(401);expect(m.copy).not.toHaveBeenCalled();expect(m.server).not.toHaveBeenCalled();});
  it("bounds failures and identity denials without fallback or private error details",async()=>{
    m.copy.mockRejectedValueOnce(new PreviewEditorDeniedError()).mockRejectedValueOnce(new Error("private SQL"));
    expect((await request()).status).toBe(403);const r=await request();expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private SQL");expect(m.server).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
  });
  it.each([["www.localley.io","?data_candidate=d1"],["localley.io","?data_candidate=d1"],[host,""],[host,"?data_candidate=other"],[host+".evil.test","?data_candidate=d1"]])("preserves Source routing for %s %s",async(hostname,flag)=>{
    expect((await request(hostname,flag)).status).toBe(404);expect(m.copy).not.toHaveBeenCalled();expect(m.server).toHaveBeenCalledOnce();expect(m.admin).toHaveBeenCalledOnce();
  });
  it.each(["AUTH_MAIL_MODE","SUPABASE_READ_ONLY"])("requires preview environment %s",async name=>{
    process.env[name]="disabled";expect((await request()).status).toBe(404);expect(m.copy).not.toHaveBeenCalled();expect(m.server).toHaveBeenCalledOnce();
  });
});
