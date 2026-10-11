// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), server: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-itinerary-export", () => ({ previewItineraryExport: mocks.read }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
import { GET } from "@/app/api/itineraries/[id]/export/route";
const id = "550e8400-e29b-41d4-a716-446655440000";
const prior = process.env;
const fixture = { title: "Owned trip", city: "Seoul", days: 1, local_score: 6, estimated_cost: "$10", highlights: ["Quiet lanes"],
  activities: [{day:1,theme:"Food",activities:[{name:"Local cafe",time:"09:00",address:"Owned address",description:"Fresh coffee",duration:"1 hour",cost:"$5"}]}],
  clerk_user_id: "one", shared: false };
const request = (host = "localley-next-preview.nkopp.workers.dev", query = "?data_candidate=d1") => GET(new NextRequest(
  `https://${host}/api/itineraries/${id}/export${query}`), { params: Promise.resolve({ id }) });
beforeEach(() => {
  process.env = {...prior,AUTH_MAIL_MODE:"outbox",SUPABASE_READ_ONLY:"true"};
  mocks.auth.mockResolvedValue({userId:"one"}); mocks.read.mockResolvedValue(fixture);
  const q = {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:fixture,error:null})};
  mocks.server.mockResolvedValue({from:vi.fn().mockReturnValue(q)});
});
afterEach(() => { process.env = prior; vi.clearAllMocks(); });
describe('private D1 export', () => {
  it('renders the existing full HTML content privately without source access',async()=>{
    const r=await request(); const html=await r.text(); expect(r.status).toBe(200);
    for(const text of ['Owned trip','Seoul','Quiet lanes','Local cafe','Owned address','Fresh coffee','1 hour','$5','$10']) expect(html).toContain(text);
    expect(r.headers.get('X-Localley-Data-Source')).toBe('d1-preview');
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(mocks.server).not.toHaveBeenCalled();
  });
  it('refuses anonymous before either repository and refuses foreign/missing candidates',async()=>{
    mocks.auth.mockResolvedValueOnce({userId:null}); expect((await request()).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(null); expect((await request()).status).toBe(404);
    expect(mocks.server).not.toHaveBeenCalled();
  });
  it('refuses unavailable D1 without fallback or private error details',async()=>{
    mocks.read.mockRejectedValue(Error('private SQL owner')); const r=await request();
    expect(r.status).toBe(500); expect(await r.text()).not.toContain('private SQL owner');
    expect(r.headers.get('Cache-Control')).toBe('private, no-store'); expect(mocks.server).not.toHaveBeenCalled();
  });
  it('preserves normal preview and www, including lost opt-in and suffix hosts',async()=>{
    for(const [host,flag] of [['www.localley.io','?data_candidate=d1'],['localley-next-preview.nkopp.workers.dev',''],
      ['localley-next-preview.nkopp.workers.dev.evil.test','?data_candidate=d1']]) {
      const r=await request(host,flag); expect(r.status).toBe(200); expect(r.headers.get('X-Localley-Data-Source')).toBeNull();
    }
    expect(mocks.server).toHaveBeenCalledTimes(3); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('requires both runtime isolation flags',async()=>{
    for(const change of [{AUTH_MAIL_MODE:'cloudflare'}, {SUPABASE_READ_ONLY:'false'}, {SUPABASE_READ_ONLY:undefined}]) {
      process.env={...prior,AUTH_MAIL_MODE:'outbox',SUPABASE_READ_ONLY:'true',...change};
      expect((await request()).headers.get('X-Localley-Data-Source')).toBeNull();
    }
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('retains private candidate headers on unexpected auth errors',async()=>{
    mocks.auth.mockRejectedValue(Error('private failure')); const r=await request();
    expect(r.status).toBe(500); expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await r.text()).not.toContain('private failure'); expect(mocks.server).not.toHaveBeenCalled();
  });
  it('escapes all user text and keeps inert HTML printable',async()=>{
    const bad='<script>alert(1)</script><img src=x onerror=alert(1)> & "quote"';
    mocks.read.mockResolvedValue({...fixture,title:bad,city:bad,estimated_cost:bad,highlights:[bad],activities:[{day:1,theme:bad,
      activities:[{name:bad,time:bad,address:bad,description:bad,duration:bad,cost:bad}]}]});
    const r=await request(); const html=await r.text(); expect(r.status).toBe(200); expect(html).not.toContain(bad);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quote&quot;');
    expect(html).not.toContain('<script>');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
