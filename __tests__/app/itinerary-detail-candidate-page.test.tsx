import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({headers:vi.fn(),auth:vi.fn(),read:vi.fn(),admin:vi.fn(),tier:vi.fn()}));
vi.mock('next/headers',()=>({headers:mocks.headers}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('notFound');}}));
vi.mock('@/lib/auth/server',()=>({auth:mocks.auth}));
vi.mock('@/lib/app-data/preview-itinerary-page',()=>({previewItineraryPage:mocks.read}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:mocks.admin}));
vi.mock('@/lib/usage-tracking',()=>({getUserTier:mocks.tier}));
vi.mock('@/components/itinerary/hero-section',()=>({HeroSection:({title}:{title:string})=><h1>{title}</h1>}));
vi.mock('@/components/itinerary/day-route-section',()=>({DayRouteSection:()=> <p>Owned day schedule</p>}));
vi.mock('@/components/itinerary/itinerary-insights-panel',()=>({ItineraryInsightsPanel:()=> <p>Owned trip notes</p>}));
vi.mock('@/components/itineraries/share-dialog',()=>({ShareDialog:()=> <button>Share</button>}));
vi.mock('@/components/itineraries/owner-email-preview-dialog',()=>({OwnerEmailPreviewDialog:({itineraryId,ownerEmail}:{itineraryId:string;ownerEmail:string})=> <button data-id={itineraryId} data-owner={ownerEmail}>Preview email link</button>}));
vi.mock('@/components/itineraries/email-dialog',()=>({EmailDialog:()=> <button>Email</button>}));
vi.mock('@/components/itineraries/story-dialog',()=>({StoryDialog:()=> <button>Generate story</button>}));
vi.mock('@/components/itinerary/itinerary-map',()=>({ItineraryMap:()=> <p>Provider map</p>}));
vi.mock('@/components/activities/viator-suggestions',()=>({ViatorSuggestions:()=> <p>Provider suggestions</p>}));
import {JsonLd} from '@/components/seo/json-ld';
import Page,{generateMetadata} from '@/app/itineraries/[id]/page';
const env=process.env;
const input=(flag?:string)=>({params:Promise.resolve({id:'owned'}),searchParams:Promise.resolve({data_candidate:flag})});
beforeEach(()=>{
  process.env={...env,AUTH_MAIL_MODE:'outbox',SUPABASE_READ_ONLY:'true'};
  mocks.headers.mockResolvedValue(new Headers({host:'localley-next-preview.nkopp.workers.dev'}));
  mocks.auth.mockResolvedValue({userId:'a'});
  mocks.tier.mockResolvedValue('free');
  mocks.read.mockResolvedValue({id:'owned',ownerEmail:'a@preview.localley.test',title:'Private trip',city:'Seoul',days:1,subtitle:null,
    localScore:6,highlights:[],dailyPlans:[{day:1,activities:[{name:'Walk'}]}],insights:[]});
  const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({
    data:{id:'source',clerk_user_id:'a',is_public:false,title:'Source trip',city:'Seoul',days:1,activities:[],highlights:[]},error:null})};
  mocks.admin.mockReturnValue({from:()=>query});
});
afterEach(()=>{process.env=env;vi.clearAllMocks();});
describe('candidate itinerary page and metadata',()=>{
  it('renders owned candidate content and explicit export without source, tier, mutation or provider controls',async()=>{
    const html=renderToStaticMarkup(await Page(input('d1')));
    expect(html).toContain('Preview email link');expect(html).toContain('data-owner="a@preview.localley.test"');expect(html).toContain('Private trip');expect(html).toContain('Owned day schedule');
    expect(html).toContain('/itineraries?data_candidate=d1');
    expect(html).toContain('/api/itineraries/owned/export?data_candidate=d1');
    expect(html).toContain('Export trip');expect(html).toContain('/itineraries/owned/edit?data_candidate=d1');expect(html).toContain('Edit itinerary');
    expect(html).not.toMatch(/Generate story|<button[^>]*>Email|<button[^>]*>Share|Provider map|Provider suggestions|application\/ld\+json/);
    expect(mocks.read).toHaveBeenCalledWith('owned','a');
    expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.tier).not.toHaveBeenCalled();
  });
  it('uses fixed private metadata with no database read or title disclosure',async()=>{
    expect(await generateMetadata(input('d1'))).toEqual({title:'Your itinerary - Localley',robots:{index:false,follow:false}});
    expect(mocks.read).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('refuses denied or anonymous data without source fallback',async()=>{
    mocks.read.mockResolvedValue(null);
    await expect(Page(input('d1'))).rejects.toThrow('notFound');
    mocks.auth.mockResolvedValue({userId:null});
    await expect(Page(input('d1'))).rejects.toThrow('notFound');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('shows a private unavailable state when D1 fails',async()=>{
    mocks.read.mockRejectedValue(Error('secret row and address'));
    const html=renderToStaticMarkup(await Page(input('d1')));
    expect(html).toContain('currently unavailable');expect(html).not.toContain('secret');
    expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.tier).not.toHaveBeenCalled();
  });
  it('preserves normal preview and flagged www source reads and normal controls',async()=>{
    let html=renderToStaticMarkup(await Page(input()));
    expect(html).toContain('Source trip');expect(html).toContain('Generate story');expect(html).not.toContain('Preview email link');
    mocks.headers.mockResolvedValue(new Headers({host:'www.localley.io'}));
    html=renderToStaticMarkup(await Page(input('d1')));
    expect(html).toContain('Source trip');expect(html).toContain('Provider suggestions');expect(html).not.toContain('Preview email link');
    expect(mocks.read).not.toHaveBeenCalled();expect(mocks.admin).toHaveBeenCalledTimes(2);
  });
});

describe('Source detail privacy including metadata',()=>{
  function sourceRow(row:object){mocks.headers.mockResolvedValue(new Headers({host:'www.localley.io'}));const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:{id:'source',title:'Confidential trip title',city:'Seoul',days:1,activities:[],highlights:[],...row},error:null})};mocks.admin.mockReturnValue({from:()=>q});}
  it.each([{clerk_user_id:'b',is_public:false},{clerk_user_id:'b',is_public:false,shared:true}])('denies foreign private content and title metadata %j',async row=>{sourceRow(row);await expect(Page(input())).rejects.toThrow('notFound');expect(JSON.stringify(await generateMetadata(input()))).not.toContain('Confidential trip title');});
  it('denies anonymous private metadata and content',async()=>{sourceRow({clerk_user_id:'a',is_public:false});mocks.auth.mockResolvedValue({userId:null});await expect(Page(input())).rejects.toThrow('notFound');expect(JSON.stringify(await generateMetadata(input()))).not.toContain('Confidential trip title');});
  it('retains owner content with private indexing controls',async()=>{sourceRow({clerk_user_id:'a',is_public:false});expect(renderToStaticMarkup(await Page(input()))).toContain('Confidential trip title');expect(await generateMetadata(input())).toMatchObject({title:'Confidential trip title - Localley',robots:{index:false,follow:false}});});
  it('retains explicitly published content for another viewer',async()=>{sourceRow({clerk_user_id:'b',is_public:true});expect(renderToStaticMarkup(await Page(input()))).toContain('Confidential trip title');expect((await generateMetadata(input())).title).toBe('Confidential trip title - Localley');});
});

it('escapes stored text inside Source JSON-LD script content',async()=>{
  mocks.headers.mockResolvedValue(new Headers({host:'www.localley.io'}));
  const title='</script><script>window.untrustedTitle=true</script>';
  const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:{id:'source',clerk_user_id:'a',is_public:false,title,city:'Seoul',days:1,activities:[],highlights:[]},error:null})};mocks.admin.mockReturnValue({from:()=>q});
  const html=renderToStaticMarkup(await Page(input()));expect(html).not.toContain(title);expect(html).toContain('\\u003c/script>');
});

it('keeps shared-page JSON-LD data lossless without a script terminator',()=>{
  const data={title:'</script><script>alert("stored")</script>',nested:{name:'A < B'}};
  const element=JsonLd({data});const text=element.props.dangerouslySetInnerHTML.__html;
  expect(text).not.toContain('<');expect(JSON.parse(text)).toEqual(data);
});
