import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({host:'localley-next-preview.nkopp.workers.dev',user:{id:'fixture'},profile:vi.fn(),source:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({host:mocks.host})}));
vi.mock('@/lib/auth/server',()=>({currentUser:async()=>mocks.user,auth:async()=>({userId:mocks.user?.id})}));
vi.mock('next/navigation',()=>({redirect:()=>{throw new Error('sign-in redirect')}}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:()=>mocks.source()}));
vi.mock('@/lib/app-data/preview-profile',()=>({previewProfile:mocks.profile}));
vi.mock('next/link',()=>({default:({href,children,...rest}:{href:string;children:React.ReactNode})=><a href={href} {...rest}>{children}</a>}));
import ProfilePage from '@/app/profile/page';
const id='550e8400-e29b-41d4-a716-446655440000';
beforeEach(()=>{vi.clearAllMocks();mocks.host='localley-next-preview.nkopp.workers.dev';mocks.profile.mockResolvedValue({trips:[{id,title:'Owned trip',city:'Seoul',days:1}],billing:{plan:'Pro',status:'Active',usage:[],periodEnd:null,trialEnd:null,cancelAtPeriodEnd:false}});mocks.source.mockImplementation(()=>{throw new Error('source boundary')});vi.stubEnv('AUTH_MAIL_MODE','outbox');vi.stubEnv('SUPABASE_READ_ONLY','true');});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
describe('profile page boundary',()=>{
 it('renders owned trips/billing with candidate links and no mutation actions',async()=>{
  render(await ProfilePage({searchParams:Promise.resolve({data_candidate:'d1'})}));
  expect(screen.getByText('Owned trip').closest('a')?.getAttribute('href')).toBe(`/itineraries/${id}?data_candidate=d1`);
  expect(screen.getByText('Pro')).not.toBeNull();expect(screen.getByText('Preview settings').getAttribute('href')).toBe('/settings?data_candidate=d1');
  expect(screen.queryByRole('button')).toBeNull();expect(mocks.source).not.toHaveBeenCalled();expect(mocks.profile).toHaveBeenCalledWith('fixture');
 });
 it('contains private read failures without source fallback or invented empty history',async()=>{
  mocks.profile.mockRejectedValue(new Error('private details'));render(await ProfilePage({searchParams:Promise.resolve({data_candidate:'d1'})}));expect(screen.getByText('Preview profile is unavailable for this account.')).not.toBeNull();expect(screen.queryByText('private details')).toBeNull();expect(screen.queryByText('No preview trips yet.')).toBeNull();expect(mocks.source).not.toHaveBeenCalled();
 });
 it.each(['AUTH_MAIL_MODE','SUPABASE_READ_ONLY'])('refuses unavailable %s isolation without source fallback',async key=>{
  vi.stubEnv(key,'off');render(await ProfilePage({searchParams:Promise.resolve({data_candidate:'d1'})}));expect(screen.getByText('Preview profile is unavailable for this account.')).not.toBeNull();expect(mocks.profile).not.toHaveBeenCalled();expect(mocks.source).not.toHaveBeenCalled();
 });
 it.each(['www.localley.io','localley.io','other.workers.dev','localley-next-preview.nkopp.workers.dev.attacker.test'])('preserves normal source reads for %s',async host=>{
  mocks.host=host;await expect(ProfilePage({searchParams:Promise.resolve({data_candidate:'d1'})})).rejects.toThrow('source boundary');expect(mocks.profile).not.toHaveBeenCalled();
 });
 it('preserves unflagged preview source reads',async()=>{await expect(ProfilePage({searchParams:Promise.resolve({})})).rejects.toThrow('source boundary');expect(mocks.profile).not.toHaveBeenCalled();});
 it('shows only 12 links and reports their actual bounded total',async()=>{const p=await mocks.profile();p.trips=Array.from({length:13},(_,i)=>({...p.trips[0],id:id.slice(0,-2)+String(i).padStart(2,'0'),title:'Trip '+i}));mocks.profile.mockResolvedValue(p);render(await ProfilePage({searchParams:Promise.resolve({data_candidate:'d1'})}));expect(screen.getByText('Your preview trips (13)')).not.toBeNull();expect(screen.getAllByRole('link').length).toBe(13);expect(screen.getByText('Showing your 12 most recent preview trips.')).not.toBeNull();});
});
