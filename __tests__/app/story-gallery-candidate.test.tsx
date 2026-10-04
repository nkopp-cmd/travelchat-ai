import React from "react";
import { beforeEach,afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks=vi.hoisted(()=>({ headers:vi.fn(),auth:vi.fn(),gallery:vi.fn(),source:vi.fn(),notFound:vi.fn() }));
vi.mock("next/headers",()=>({headers:mocks.headers}));
vi.mock("next/navigation",()=>({notFound:mocks.notFound}));
vi.mock("@/lib/auth/server",()=>({auth:mocks.auth}));
vi.mock("@/lib/app-data/preview-story-gallery",()=>({previewStoryGallery:mocks.gallery}));
vi.mock("@/lib/supabase",()=>({createSupabaseAdmin:mocks.source}));
vi.mock("@/app/itineraries/[id]/stories/stories-client",()=>({StoriesClient:(props: {candidate:boolean;slides:unknown[]})=><div data-candidate={String(props.candidate)}>{JSON.stringify(props.slides)}</div>}));
import Page,{generateMetadata} from "@/app/itineraries/[id]/stories/page";
const environment=process.env;
const id="11111111-1111-4111-8111-111111111111";
const props=(flag:unknown="d1")=>({params:Promise.resolve({id}),searchParams:Promise.resolve({data_candidate:flag as string})});
const row={id,title:"Owned gallery",city:"Seoul",days:1,story_slides:{slides:{cover:"https://localley-next-preview.nkopp.workers.dev/owned.png"}}};
beforeEach(()=>{
  process.env={...environment,AUTH_MAIL_MODE:"outbox",SUPABASE_READ_ONLY:"true"};
  mocks.headers.mockResolvedValue(new Headers({host:"localley-next-preview.nkopp.workers.dev"}));
  mocks.auth.mockResolvedValue({userId:"a"}); mocks.gallery.mockResolvedValue(row);
  mocks.notFound.mockImplementation(()=>{throw new Error("not found");});
  mocks.source.mockReturnValue({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{...row,title:"Source gallery"},error:null})})})})});
});
afterEach(()=>{process.env=environment;vi.clearAllMocks();});
describe("story gallery candidate page and metadata",()=>{
  it("uses owned D1 data in body and metadata with no source or private OpenGraph media",async()=>{
    const html=renderToStaticMarkup(await Page(props()));
    expect(html).toContain("Owned gallery");expect(html).toContain('data-candidate="true"');
    const metadata=await generateMetadata(props());
    expect(metadata).toEqual({title:"Stored Story Slides | Localley",robots:{index:false,follow:false}});
    expect(mocks.gallery).toHaveBeenCalledWith(id,"a");expect(mocks.source).not.toHaveBeenCalled();
  });
  it("shows an empty or expired state with a candidate trip return link",async()=>{
    mocks.gallery.mockResolvedValue({...row,story_slides:null,expired:true});
    const html=renderToStaticMarkup(await Page(props()));
    expect(html).toContain("Stories Not Ready Yet");expect(html).toContain(`href="/itineraries/${id}?data_candidate=d1"`);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("refuses missing or unavailable candidate records and hides their metadata",async()=>{
    mocks.gallery.mockResolvedValue(null);
    await expect(Page(props())).rejects.toThrow("not found");
    expect(await generateMetadata(props())).toEqual({title:"Stories Not Found | Localley"});
    mocks.gallery.mockRejectedValue(new Error("private raw SQL"));
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    await expect(Page(props())).rejects.toThrow("not found");
    expect(log).toHaveBeenCalledWith("[STORIES_PREVIEW] Gallery unavailable");log.mockRestore();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("keeps normal preview and flagged www on the original source page and metadata",async()=>{
    for(const [host,flag] of [["localley-next-preview.nkopp.workers.dev",undefined],["www.localley.io","d1"]]){
      mocks.headers.mockResolvedValue(new Headers({host}));
      const p={params:Promise.resolve({id}),searchParams:Promise.resolve({data_candidate:flag})};
      expect(renderToStaticMarkup(await Page(p))).toContain("Source gallery");
      expect((await generateMetadata(p)).title).toBe("Seoul Story Slides | Localley");
    }
    expect(mocks.gallery).not.toHaveBeenCalled();
  });
});
