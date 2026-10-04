import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({host:'localley-next-preview.nkopp.workers.dev',user:{id:'fixture'},assertUser:vi.fn(),source:vi.fn(),billing:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({host:mocks.host})}));
vi.mock('@/lib/auth/server',()=>({currentUser:async()=>mocks.user,auth:async()=>({userId:mocks.user?.id})}));
vi.mock('next/navigation',()=>({redirect:()=>{throw new Error('sign-in redirect')}}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:()=>mocks.source()}));
vi.mock('@/lib/app-data/preview-notifications',()=>({assertPreviewNotificationUser:mocks.assertUser}));
vi.mock('@/components/settings/notification-preferences',()=>({NotificationPreferencesSection:()=> <p>Existing notification controls</p>}));
vi.mock('@/lib/app-data/preview-billing-settings',()=>({previewBillingSettings:mocks.billing}));
vi.mock('@/components/settings/preview-email-preferences',()=>({PreviewEmailPreferences:()=> <p>Preview email controls</p>}));
import SettingsPage from '@/app/settings/page';
beforeEach(()=>{vi.clearAllMocks();mocks.billing.mockResolvedValue(null);mocks.host='localley-next-preview.nkopp.workers.dev';mocks.user={id:'fixture'};mocks.assertUser.mockResolvedValue(undefined);mocks.source.mockImplementation(()=>{throw new Error('source boundary')});vi.stubEnv('AUTH_MAIL_MODE','outbox');vi.stubEnv('SUPABASE_READ_ONLY','true');});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
describe('settings server candidate boundary',()=>{
 it('renders owned billing beside existing notification controls and contains storage failures',async()=>{
  mocks.billing.mockResolvedValueOnce({plan:'Pro',status:'Active',periodEnd:null,trialEnd:null,cancelAtPeriodEnd:false,usage:[]});
  render(await SettingsPage({searchParams:Promise.resolve({data_candidate:'d1'})}));expect(screen.getByText('Pro')).not.toBeNull();expect(screen.getByText('Existing notification controls')).not.toBeNull();expect(mocks.billing).toHaveBeenCalledWith('fixture');expect(mocks.source).not.toHaveBeenCalled();cleanup();
  mocks.billing.mockRejectedValueOnce(new Error('private database detail'));render(await SettingsPage({searchParams:Promise.resolve({data_candidate:'d1'})}));expect(screen.getByText('Preview billing is unavailable for this account.')).not.toBeNull();expect(screen.queryByText('private database detail')).toBeNull();expect(mocks.source).not.toHaveBeenCalled();
 });
 it('renders existing notification controls without any source client',async()=>{
  render(await SettingsPage({searchParams:Promise.resolve({data_candidate:'d1'})}));
  expect(screen.getByText('Preview email controls')).not.toBeNull();expect(screen.getByText('Existing notification controls')).not.toBeNull();expect(mocks.assertUser).toHaveBeenCalledWith('fixture');expect(mocks.source).not.toHaveBeenCalled();
 });
 it('refuses unknown historical or unverified accounts without source fallback',async()=>{
  mocks.assertUser.mockRejectedValue(new Error('unavailable'));render(await SettingsPage({searchParams:Promise.resolve({data_candidate:'d1'})}));expect(screen.getByText('Preview notification settings are unavailable for this account.').textContent).toContain('unavailable');expect(screen.queryByText('Preview email controls')).toBeNull();expect(screen.getByText('Preview email preferences are unavailable for this account.')).not.toBeNull();expect(screen.queryByText('Existing notification controls')).toBeNull();expect(mocks.source).not.toHaveBeenCalled();
 });
 it.each(['www.localley.io','localley.io','other.workers.dev'])('keeps %s on the original source path',async host=>{
  mocks.host=host;await expect(SettingsPage({searchParams:Promise.resolve({data_candidate:'d1'})})).rejects.toThrow('source boundary');expect(mocks.assertUser).not.toHaveBeenCalled();expect(mocks.billing).not.toHaveBeenCalled();expect(mocks.source).toHaveBeenCalledOnce();
 });
 it('keeps normal preview settings on the original source path',async()=>{
  await expect(SettingsPage({searchParams:Promise.resolve({})})).rejects.toThrow('source boundary');expect(mocks.assertUser).not.toHaveBeenCalled();expect(mocks.billing).not.toHaveBeenCalled();
 });
 it.each(['AUTH_MAIL_MODE','SUPABASE_READ_ONLY'])('requires server gate %s',async key=>{
  vi.stubEnv(key,'off');await expect(SettingsPage({searchParams:Promise.resolve({data_candidate:'d1'})})).rejects.toThrow('source boundary');expect(mocks.assertUser).not.toHaveBeenCalled();expect(mocks.billing).not.toHaveBeenCalled();
 });
});
