import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({auth:vi.fn(),queue:vi.fn(),send:vi.fn(),source:vi.fn(),single:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/auth/server",()=>({auth:mocks.auth}));
vi.mock("@/lib/app-data/preview-itinerary-mail",()=>({queuePreviewItineraryMail:mocks.queue}));
vi.mock("@/lib/supabase-server",()=>({createSupabaseServerClient:mocks.source}));
vi.mock("@/lib/itinerary-mail-limit",()=>({reserveItineraryMail:mocks.limit}));
vi.mock("@/lib/itinerary-mail",()=>({sendItineraryEmail:mocks.send}));
vi.mock("@/emails/itinerary-email",()=>({ItineraryEmail:()=>null}));
import { POST } from "@/app/api/itineraries/[id]/email/route";
const environment=process.env,host='localley-next-preview.nkopp.workers.dev';
const context={params:Promise.resolve({id:'owned-id'})};
const req=(body:BodyInit=JSON.stringify({recipientEmail:'a@preview.localley.test'}),hostname=host,flag=true)=>new NextRequest(
  `https://${hostname}/api/itineraries/owned-id/email${flag?'?data_candidate=d1':''}`,{method:'POST',body});
beforeEach(()=>{process.env={...environment,AUTH_MAIL_MODE:'outbox',SUPABASE_READ_ONLY:'true'};
  mocks.auth.mockResolvedValue({userId:'a'});mocks.queue.mockResolvedValue(true);mocks.limit.mockResolvedValue('allowed');});
afterEach(()=>{process.env=environment;vi.clearAllMocks();vi.unstubAllGlobals();});
describe('candidate itinerary mail route',()=>{
  it('records only an owner request honestly without source, XP or real send',async()=>{
    const response=await POST(req(JSON.stringify({recipientEmail:'a@preview.localley.test',recipientName:'Ignored'})),context);
    expect(response.status).toBe(200);expect(await response.json()).toEqual({success:true,sent:false,queued:true,reason:'preview_outbox'});
    expect(response.headers.get('Cache-Control')).toContain('no-store');expect(response.headers.get('X-Localley-Data-Source')).toBe('d1-preview');
    expect(mocks.queue).toHaveBeenCalledWith('a','owned-id','a@preview.localley.test');
    expect(mocks.source).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('refuses anonymous, foreign, recipient overrides and unavailable data without fallback or private errors',async()=>{
    mocks.auth.mockResolvedValue({userId:null});expect((await POST(req(),context)).status).toBe(401);expect(mocks.queue).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({userId:'a'});mocks.queue.mockResolvedValue(false);expect((await POST(req(),context)).status).toBe(404);
    mocks.queue.mockRejectedValue(new RangeError('private recipient'));expect((await POST(req(),context)).status).toBe(400);
    mocks.queue.mockRejectedValue(new Error('private@example.com'));const response=await POST(req(),context);
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('private@example.com');
    expect(mocks.source).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rejects malformed, oversized and content/link input overrides before queueing',async()=>{
    for(const body of ['broken','null','[]','{}','{"recipientEmail":3}',JSON.stringify({recipientEmail:'x'.repeat(201)}),
      JSON.stringify({recipientEmail:'a\n@preview.localley.test'}),JSON.stringify({recipientEmail:'a@preview.localley.test',recipientName:'x'.repeat(101)}),
      JSON.stringify({recipientEmail:'a@preview.localley.test',url:'https://evil.test'}),JSON.stringify({recipientEmail:'a@preview.localley.test',html:'content'}),' '.repeat(513)])
      expect((await POST(req(body),context)).status).toBe(400);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('bounds a streamed request across chunks rather than trusting Content-Length',async()=>{
    let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(300));controller.enqueue(new Uint8Array(300));},
      cancel(){cancelled=true;}});
    expect((await POST(req(stream),context)).status).toBe(400);expect(cancelled).toBe(true);expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('preserves normal preview and flagged www source rendering/send/XP behavior',async()=>{
    const chain={select:vi.fn(),eq:vi.fn(),single:mocks.single};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);
    mocks.source.mockResolvedValue({from:()=>chain});mocks.single.mockResolvedValue({data:{title:'Source trip',city:'Seoul',
      activities:JSON.stringify([{day:1,activities:[{name:'Walk',description:'Source stop'}]}]),highlights:[],share_code:null},error:null});
    mocks.send.mockResolvedValue({sent:true,emailId:'cloudflare-id'});const fetchMock=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetchMock);
    for(const request of [req(JSON.stringify({recipientEmail:'real@example.com'}),host,false),req(JSON.stringify({recipientEmail:'real@example.com'}),'www.localley.io')]){
      const response=await POST(request,context);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({success:true,emailId:'cloudflare-id'});
      expect(response.headers.get('X-Localley-Data-Source')).toBeNull();
    }
    expect(mocks.queue).not.toHaveBeenCalled();expect(mocks.send).toHaveBeenCalledTimes(2);expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('refuses source owner absence before transport',async()=>{
    const chain={select:vi.fn(),eq:vi.fn(),single:mocks.single};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);
    mocks.source.mockResolvedValue({from:()=>chain});mocks.single.mockResolvedValue({data:null,error:{code:'missing'}});
    const response=await POST(req(JSON.stringify({recipientEmail:'real@example.com'}),'www.localley.io',false),context);
    expect(response.status).toBe(404);expect(chain.eq).toHaveBeenCalledWith('clerk_user_id','a');expect(mocks.send).not.toHaveBeenCalled();
  });
  it('queues normal preview honestly without XP and uses a fixed safe Localley URL',async()=>{
    const chain={select:vi.fn(),eq:vi.fn(),single:mocks.single};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);
    mocks.source.mockResolvedValue({from:()=>chain});mocks.single.mockResolvedValue({data:{title:'Source',city:'Seoul',activities:[],share_code:'abc/def'},error:null});
    mocks.send.mockResolvedValue({sent:false,queued:true,reason:'preview_outbox'});const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    const response=await POST(req(JSON.stringify({recipientEmail:'real@example.com'}),host,false),context);
    expect(await response.json()).toEqual({success:true,sent:false,queued:true,reason:'preview_outbox'});
    expect(mocks.send).toHaveBeenCalledWith('real@example.com',expect.objectContaining({shareUrl:'https://localley.io/shared/abc%2Fdef'}));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sanitizes failed sender responses and never awards XP or retries',async()=>{
    const chain={select:vi.fn(),eq:vi.fn(),single:mocks.single};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);
    mocks.source.mockResolvedValue({from:()=>chain});mocks.single.mockResolvedValue({data:{title:'Source',city:'Seoul',activities:[]},error:null});
    mocks.send.mockRejectedValue(new Error('private@example.com token=secret'));const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    const response=await POST(req(JSON.stringify({recipientEmail:'real@example.com'}),'www.localley.io',false),context);
    expect(response.status).toBe(502);expect(await response.text()).not.toContain('private@example.com');expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refuses malformed normal recipient metadata before source or sender',async()=>{
    for(const value of [{recipientEmail:3},{recipientEmail:'a\n@b.test'},{recipientEmail:'a@b.test',recipientName:{}},{recipientEmail:'a@b.test,c.test'},
      {recipientEmail:'a@b.test',recipientName:'x'.repeat(101)}]){
      expect((await POST(req(JSON.stringify(value),'www.localley.io',false),context)).status).toBe(400);
    }
    expect(mocks.source).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });

  it('fails closed on exhausted or unavailable durable limits before send or XP',async()=>{
    process.env.AUTH_MAIL_MODE='cloudflare';process.env.BETTER_AUTH_URL='https://www.localley.io';
    const chain={select:vi.fn(),eq:vi.fn(),single:mocks.single};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);
    mocks.source.mockResolvedValue({from:()=>chain});mocks.single.mockResolvedValue({data:{title:'Source',city:'Seoul',activities:[]},error:null});
    mocks.limit.mockResolvedValue('limited');expect((await POST(req(JSON.stringify({recipientEmail:'real@example.com'}),'www.localley.io',false),context)).status).toBe(429);
    mocks.limit.mockResolvedValue('unavailable');expect((await POST(req(JSON.stringify({recipientEmail:'real@example.com'}),'www.localley.io',false),context)).status).toBe(502);
    expect(mocks.send).not.toHaveBeenCalled();expect(mocks.limit).toHaveBeenCalledWith('a');
  });

});
