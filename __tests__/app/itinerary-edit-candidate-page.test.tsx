vi.mock("@/lib/usage-tracking", () => ({ getFreshUserTier: vi.fn(async () => "pro") }));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({headers:vi.fn(),auth:vi.fn(),read:vi.fn(),admin:vi.fn()}));
vi.mock('next/headers',()=>({headers:mocks.headers}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('notFound');},redirect:(url:string)=>{throw Error('redirect:'+url);}}));
vi.mock('@/lib/auth/server',()=>({auth:mocks.auth,currentUser:vi.fn()}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:mocks.admin}));
vi.mock('@/lib/app-data/preview-itinerary-editor',async()=>({...await vi.importActual('@/lib/app-data/preview-itinerary-editor'),previewItineraryEditor:mocks.read}));
vi.mock('@/components/itineraries/edit-form',()=>({EditForm:({itinerary,dataCandidate,previewActor}:{itinerary:{title:string};dataCandidate?:string;previewActor?:string})=><div data-candidate={dataCandidate} data-actor={previewActor}>{itinerary.title}</div>}));
import Page,{generateMetadata} from '@/app/itineraries/[id]/edit/page';
const env=process.env,input=(flag?:string)=>({params:Promise.resolve({id:'owned'}),searchParams:Promise.resolve({data_candidate:flag})});
beforeEach(()=>{
 process.env={...env,AUTH_MAIL_MODE:'outbox',SUPABASE_READ_ONLY:'true'};mocks.headers.mockResolvedValue(new Headers({host:'localley-next-preview.nkopp.workers.dev'}));mocks.auth.mockResolvedValue({userId:'a'});
 mocks.read.mockResolvedValue({id:'owned',title:'Private <script>trip</script>',city:'Seoul',days:1,activities:[],highlights:[]});
 const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:{id:'source',clerk_user_id:'a',title:'Source trip'},error:null})};mocks.admin.mockReturnValue({from:()=>q});
});
afterEach(()=>{process.env=env;vi.clearAllMocks();});
describe('candidate edit page',()=>{
 it('renders only owned candidate data with opt-in/actor and escaped text',async()=>{const html=renderToStaticMarkup(await Page(input('d1')));expect(html).toContain('data-candidate="d1"');expect(html).toContain('data-actor="a"');expect(html).toContain('&lt;script&gt;');expect(mocks.read).toHaveBeenCalledWith('owned','a');expect(mocks.admin).not.toHaveBeenCalled();});
 it('denies missing, foreign or unverified results and anonymous requests',async()=>{mocks.read.mockResolvedValue(null);await expect(Page(input('d1'))).rejects.toThrow('notFound');mocks.auth.mockResolvedValue({userId:null});await expect(Page(input('d1'))).rejects.toThrow('notFound');expect(mocks.admin).not.toHaveBeenCalled();});
 it('shows a generic unavailable state on D1 failure',async()=>{mocks.read.mockRejectedValue(Error('private SQL and owner'));const html=renderToStaticMarkup(await Page(input('d1')));expect(html).toContain('currently unavailable');expect(html).not.toContain('private SQL');expect(mocks.admin).not.toHaveBeenCalled();});
 it('never falls back when explicit intent lacks safety flags',async()=>{delete process.env.AUTH_MAIL_MODE;const html=renderToStaticMarkup(await Page(input('d1')));expect(html).toContain('currently unavailable');expect(mocks.read).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled();});
 it('preserves normal preview and flagged www Source behavior',async()=>{expect(renderToStaticMarkup(await Page(input()))).toContain('Source trip');mocks.headers.mockResolvedValue(new Headers({host:'www.localley.io'}));expect(renderToStaticMarkup(await Page(input('d1')))).toContain('Source trip');expect(mocks.read).not.toHaveBeenCalled();expect(mocks.admin).toHaveBeenCalledTimes(2);});
 it('uses fixed private metadata without reading any row',async()=>{expect(await generateMetadata(input('d1'))).toEqual({title:'Edit your itinerary - Localley',robots:{index:false,follow:false}});expect(mocks.read).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled();});
});

it('refuses noncanonical preview Host variants without touching Source',async()=>{for(const host of ['LOCALLEY-NEXT-PREVIEW.NKOPP.WORKERS.DEV','localley-next-preview.nkopp.workers.dev:443']){mocks.headers.mockResolvedValue(new Headers({host}));expect(renderToStaticMarkup(await Page(input('d1')))).toContain('currently unavailable');}expect(mocks.admin).not.toHaveBeenCalled();});
