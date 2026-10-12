// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), tier: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier }));
vi.mock("@/lib/subscription", () => ({ hasFeature: () => 7 }));
import { GET, POST } from "@/app/api/itineraries/[id]/story/persist/route";
const id = "11111111-1111-4111-8111-111111111111", path = `https://www.localley.io/api/itineraries/${id}/story/persist`;
const params = { params: Promise.resolve({ id }) };
const signedUrl = "https://storage.example/object/sign/cover.png?token=controlled";
const metadata = { tier: "free", generated_at: new Date().toISOString(), expires_at: new Date(Date.now()+86400000).toISOString(), slides: { cover: signedUrl } };
let single: ReturnType<typeof vi.fn>, sign: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>;
beforeEach(() => {
 vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "owner" }); mocks.tier.mockResolvedValue("free");
 single = vi.fn().mockResolvedValue({ data: { clerk_user_id: "owner", shared: false, story_slides: metadata }, error: null });
 update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
 const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single, update };
 sign = vi.fn().mockResolvedValue({ data: { signedUrl }, error: null });
 mocks.source.mockReturnValue({ from: vi.fn().mockReturnValue(query), storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }), createSignedUrl: sign }) } });
});
const upload = () => { const body=new FormData(); body.append("cover",new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])]),"cover.png");return POST(new NextRequest(path,{method:"POST",body}),params); };
describe("Source private story links and read access", () => {
 it("returns private-bucket signed links with the tier retention period", async () => {
  const response = await upload();expect(response.status).toBe(200);expect((await response.json()).slides.cover).toBe(signedUrl);
  expect(sign).toHaveBeenCalledWith(`story-slides/${id}/cover.png`,7*86400);
 });
 it("does not save an unusable link when signing fails", async () => {
  sign.mockResolvedValue({ data: null, error: new Error("signing failed") });expect((await upload()).status).toBe(400);expect(update).not.toHaveBeenCalled();
 });
 it.each([null,"other-owner"])("hides private media links from unauthorised readers",async userId=>{
  mocks.auth.mockResolvedValue({userId});const response=await GET(new NextRequest(path),params);expect(response.status).toBe(404);expect(await response.text()).not.toContain(signedUrl);
 });
 it("returns the exact owner's slides with no shared cache",async()=>{
  const response=await GET(new NextRequest(path),params);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect((await response.json()).slides.cover).toBe(signedUrl);
 });
 it("preserves anonymous reads of explicitly shared stories",async()=>{
  mocks.auth.mockResolvedValue({userId:null});single.mockResolvedValue({data:{shared:true,clerk_user_id:"owner",story_slides:metadata},error:null});
  const response=await GET(new NextRequest(path),params);expect(response.status).toBe(200);expect((await response.json()).slides.cover).toBe(signedUrl);
 });
});
