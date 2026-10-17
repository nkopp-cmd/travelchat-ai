// @vitest-environment node
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({email:'nkopp@my-goodlife.com',tier:'free',calls:[] as string[],cacheParts:[] as string[]}));
const owners=['user_38VRkLQbwVNbAqR9lBXTMGXr54h','eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx'];
vi.mock('@/lib/early-adopters',()=>({isBetaMode:()=>false,isEarlyAdopter:async()=>false}));
vi.mock('next/cache',()=>({unstable_cache:(fn:()=>unknown,parts:string[])=>{m.cacheParts=parts;return fn;},revalidateTag:vi.fn()}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:()=>({from:(table:string)=>{m.calls.push(table);const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='users'?{email:m.email}:{tier:m.tier,status:'active'},error:null})};return q;}})}));
import {getUserTier} from '@/lib/usage-tracking';
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{vi.stubEnv('ADMIN_USER_IDS',owners.join(','));m.email='nkopp@my-goodlife.com';m.tier='free';m.calls=[];m.cacheParts=[];});
describe('Source email is not a lifetime grant authority',()=>{
 it.each(['nkopp@my-goodlife.com','hello@localley.io'])('does not upgrade an ordinary user who stores %s',async email=>{m.email=email;expect(await getUserTier('ordinary-user')).toBe('free');expect(m.calls).not.toContain('users');expect(m.cacheParts).toContain('owner-authority-v1');});
 it('fails closed when the owner configuration is absent',async()=>{vi.stubEnv('ADMIN_USER_IDS','');expect(await getUserTier(owners[0])).toBe('free');});
 it('preserves a real paid tier instead of upgrading a forged email to Premium',async()=>{m.tier='pro';expect(await getUserTier('ordinary-user')).toBe('pro');});
 it.each(owners)('retains the approved owner %s',async id=>{expect(await getUserTier(id)).toBe('premium');});
 it('still requires an approved lifetime email for an allowlisted owner',async()=>{m.email='ordinary@preview.localley.test';expect(await getUserTier(owners[0])).toBe('free');});
});
