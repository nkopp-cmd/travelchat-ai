import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({candidate:true,signed:true,subscribe:vi.fn(),unsubscribe:vi.fn(),toast:vi.fn()}));
vi.mock("@/lib/auth/client",()=>({useUser:()=>({isSignedIn:mocks.signed})}));
vi.mock("@/lib/app-data/notification-candidate-url",()=>({isPreviewNotificationSettings:()=>mocks.candidate,notificationPreferencesUrl:()=>`/api/notifications/preferences${mocks.candidate?'?data_candidate=d1':''}`}));
vi.mock("@/hooks/use-push-notifications",()=>({usePushNotifications:()=>({isSupported:true,isSubscribed:false,isLoading:false,permission:'default',subscribe:mocks.subscribe,unsubscribe:mocks.unsubscribe})}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:mocks.toast})}));
import { useNotificationPreferences } from "@/hooks/use-notifications";
import { NotificationPreferencesSection } from "@/components/settings/notification-preferences";
const defaults={clerkUserId:'fixture',pushEnabled:true,emailEnabled:true,achievements:true,levelUps:true,newSpots:true,social:true,challenges:true,weeklyDigest:true,system:true,timezone:'UTC'};
let stored={...defaults};
beforeEach(()=>{
 mocks.candidate=true;mocks.signed=true;stored={...defaults};vi.clearAllMocks();
 vi.stubGlobal('fetch',vi.fn(async (_url:string,options?:RequestInit)=>{
  if(options?.method==='PATCH')stored={...stored,...JSON.parse(String(options.body))};
  return new Response(JSON.stringify(stored),{status:200});
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('candidate notification preference UI',()=>{
 it('carries the candidate URL through reads, writes and reloads',async()=>{
  const first=renderHook(()=>useNotificationPreferences());await waitFor(()=>expect(first.result.current.preferences?.weeklyDigest).toBe(true));
  await act(async()=>first.result.current.updatePreferences({weeklyDigest:false}));expect(first.result.current.preferences?.weeklyDigest).toBe(false);first.unmount();
  const second=renderHook(()=>useNotificationPreferences());await waitFor(()=>expect(second.result.current.preferences?.weeklyDigest).toBe(false));
  expect(vi.mocked(fetch).mock.calls.map(([url])=>url)).toEqual(Array(3).fill('/api/notifications/preferences?data_candidate=d1'));
  expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({method:'PATCH',body:'{"weeklyDigest":false}'});
 });
 it('keeps every normal request on the source URL',async()=>{
  mocks.candidate=false;const hook=renderHook(()=>useNotificationPreferences());await waitFor(()=>expect(hook.result.current.preferences).not.toBeNull());
  await act(async()=>hook.result.current.updatePreferences({weeklyDigest:false}));expect(hook.result.current.isPreviewCandidate).toBe(false);
  expect(vi.mocked(fetch).mock.calls.map(([url])=>url)).toEqual(['/api/notifications/preferences','/api/notifications/preferences']);
 });
 it('shows persisted category choices without enabling preview delivery',async()=>{
  render(<NotificationPreferencesSection/>);const toggle=await screen.findByRole('switch',{name:'Weekly Recap'});
  expect(screen.getByRole('status').textContent).toContain('Notifications are not sent from this preview');
  expect(screen.queryByRole('button',{name:'Enable'})).toBeNull();expect(screen.queryByRole('switch',{name:'Email Notifications'})).toBeNull();
  fireEvent.click(toggle);await waitFor(()=>expect(toggle.getAttribute('aria-checked')).toBe('false'));expect(stored.weeklyDigest).toBe(false);
  expect(mocks.subscribe).not.toHaveBeenCalled();expect(mocks.unsubscribe).not.toHaveBeenCalled();
 });
 it('preserves normal delivery controls',async()=>{
  mocks.candidate=false;render(<NotificationPreferencesSection/>);await screen.findByRole('switch',{name:'Weekly Recap'});
  expect(screen.getByRole('button',{name:'Enable'})).not.toBeNull();expect(screen.getByRole('switch',{name:'Email Notifications'})).not.toBeNull();
 });
 it('does not expose controls or claim a save when storage is unavailable',async()=>{
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({available:false}),{status:200}));render(<NotificationPreferencesSection/>);
  expect((await screen.findByRole('status')).textContent).toContain('currently unavailable');expect(screen.queryByRole('switch')).toBeNull();expect(mocks.toast).not.toHaveBeenCalled();
 });
 it('retains the stored choice and shows failure when a write is refused',async()=>{
  render(<NotificationPreferencesSection/>);const toggle=await screen.findByRole('switch',{name:'Weekly Recap'});
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}',{status:503}));fireEvent.click(toggle);
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({variant:'destructive'})));
  expect(toggle.getAttribute('aria-checked')).toBe('true');expect(stored.weeklyDigest).toBe(true);
 });
});
