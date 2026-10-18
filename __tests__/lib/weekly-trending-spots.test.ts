import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
  createSupabaseClient: mocks.createSupabaseClient,
}));

import { fetchWeeklyTrendingSpots } from "@/lib/spots/weekly-trending";

function query<T>(data:T, error: {message:string} | null = null) {
  return {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),in:vi.fn().mockReturnThis(),then:(resolve:(value:{data:T,error:{message:string}|null})=>unknown)=>Promise.resolve({data,error}).then(resolve)};
}
const publicSpot={id:"owned-public-fixture",name:{en:"Ikseon Tea Room"},description:{en:"A quiet tea room."},address:{en:"17 Supyo-ro 28-gil, Jongno-gu, Seoul"},category:"Cafe",subcategories:[],location:{type:"Point",coordinates:[126.9908,37.5744]},localley_score:5,local_percentage:88,photos:["/api/places/photo?name=places%2FChIJabc123%2Fphotos%2Fphoto456&w=1200"],google_place_id:"ChIJabc123",tips:[],verified:true,trending_score:0.8,destination:null,localArea:null};

describe("weekly trending spots loader", () => {
  afterEach(() => {
    delete process.env.WEEKLY_SOCIAL_TRENDS_ENABLED;
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads ranking internals as admin but keeps public display geography behind catalog RLS",async()=>{
    vi.stubEnv("WEEKLY_SOCIAL_TRENDS_ENABLED","true");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","server-test-key");
    const ranked=query([{spot_id:publicSpot.id,city_slug:"seoul",rank:1,score:2,post_count:1,platform_count:1}]),catalog=query([publicSpot]);
    const adminFrom=vi.fn((table:string)=>{if(table!=="weekly_city_spot_rankings")throw Error("Admin must not read public display rows");return ranked;}),publicFrom=vi.fn(()=>catalog);
    mocks.createSupabaseAdmin.mockReturnValue({from:adminFrom});mocks.createSupabaseClient.mockReturnValue({from:publicFrom});
    const rows=await fetchWeeklyTrendingSpots(null);expect(rows).toHaveLength(1);expect(rows[0].spot.cityName).toBe("Seoul");expect(rows[0].spot.areaName).toBe("Jongno");
    expect(adminFrom).toHaveBeenCalledTimes(1);expect(publicFrom).toHaveBeenCalledWith("spots");expect(ranked.limit).toHaveBeenCalledWith(10);
    expect(catalog.select.mock.calls[0][0]).not.toContain("*");expect(catalog.select.mock.calls[0][0]).not.toContain("discovered_by");
  });
  it("does not retry a failed public read with admin access",async()=>{
    vi.stubEnv("WEEKLY_SOCIAL_TRENDS_ENABLED","true");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","server-test-key");
    const ranked=query([{spot_id:publicSpot.id,city_slug:"seoul",rank:1}]),catalog=query([],{message:"Public read unavailable"}),adminFrom=vi.fn(()=>ranked);
    mocks.createSupabaseAdmin.mockReturnValue({from:adminFrom});mocks.createSupabaseClient.mockReturnValue({from:vi.fn(()=>catalog)});
    await expect(fetchWeeklyTrendingSpots(null)).resolves.toEqual([]);expect(adminFrom).toHaveBeenCalledTimes(1);
  });
  it("returns no public section and performs no query while disabled", async () => {
    process.env.WEEKLY_SOCIAL_TRENDS_ENABLED = "false";

    await expect(fetchWeeklyTrendingSpots(null)).resolves.toEqual([]);
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });
});
