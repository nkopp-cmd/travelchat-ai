import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({auth:vi.fn(),source:vi.fn(),link:vi.fn(),guide:vi.fn()}));
vi.mock('@/lib/auth/server',()=>({auth:mocks.auth}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:mocks.source}));
vi.mock('@/lib/stripe-connect',()=>({createDashboardLink:mocks.link}));
import { GET } from '@/app/api/connect/dashboard/route';
const host='localley-next-preview.nkopp.workers.dev',original=process.env;
const request=(hostname=host,query='?data_candidate=d1')=>new NextRequest(`https://${hostname}/api/connect/dashboard${query}`);
beforeEach(()=>{vi.resetAllMocks();process.env={...original,AUTH_MAIL_MODE:'outbox',SUPABASE_READ_ONLY:'true'};mocks.auth.mockResolvedValue({userId:'owner'});mocks.guide.mockResolvedValue({data:{stripe_account_id:'acct_test',stripe_onboarding_complete:true,status:'approved'}});mocks.source.mockReturnValue({from:()=>({select:()=>({eq:()=>({single:mocks.guide})})})});mocks.link.mockResolvedValue('https://connect.stripe.test/dashboard');});
afterEach(()=>{process.env=original;});
describe('Connect dashboard candidate boundary',()=>{
 it('refuses before source guide reads and external login-link creation',async()=>{const r=await GET(request());expect(r.status).toBe(503);expect(await r.json()).toEqual({error:{code:'feature_disabled',message:'Billing changes are unavailable in this preview.'}});expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('x-localley-data-source')).toBe('d1-preview');expect(mocks.auth).toHaveBeenCalledTimes(1);expect(mocks.source).not.toHaveBeenCalled();expect(mocks.link).not.toHaveBeenCalled();});
 it.each([{}, {AUTH_MAIL_MODE:'send',SUPABASE_READ_ONLY:'false'}])('refuses explicit intent with absent or wrong safety configuration',async vars=>{process.env={...original,AUTH_MAIL_MODE:undefined,SUPABASE_READ_ONLY:undefined,...vars};expect((await GET(request())).status).toBe(503);expect(mocks.source).not.toHaveBeenCalled();expect(mocks.link).not.toHaveBeenCalled();});
 it('requires a session without exposing guide or provider data',async()=>{mocks.auth.mockResolvedValue({userId:null});expect((await GET(request())).status).toBe(401);expect(mocks.source).not.toHaveBeenCalled();expect(mocks.link).not.toHaveBeenCalled();});
 it.each([[host,''],[host,'?data_candidate=other'],['www.localley.io','?data_candidate=d1'],['localley.io','?data_candidate=d1'],[host+'.attacker.test','?data_candidate=d1']])('preserves normal source path %s %s',async(h,q)=>{const r=await GET(request(h,q));expect(r.status).toBe(200);expect(await r.json()).toEqual({url:'https://connect.stripe.test/dashboard'});expect(r.headers.get('x-localley-data-source')).toBeNull();expect(mocks.source).toHaveBeenCalledTimes(1);expect(mocks.link).toHaveBeenCalledWith('acct_test');});
 it('retains normal missing-guide refusal without external calls',async()=>{mocks.guide.mockResolvedValue({data:null});expect((await GET(request(host,''))).status).toBe(404);expect(mocks.link).not.toHaveBeenCalled();});
});
