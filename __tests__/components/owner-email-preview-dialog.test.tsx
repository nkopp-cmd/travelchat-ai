import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({url:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/app-data/itinerary-mail-candidate-url',()=>({itineraryMailCandidateUrl:mocks.url}));
import { OwnerEmailPreviewDialog } from '@/components/itineraries/owner-email-preview-dialog';
const id='00000000-0000-4000-8000-000000000001',email='owner@preview.localley.test';
const queued={success:true,queued:true,sent:false,reason:'preview_outbox'};
const open=(ownerEmail=email)=>{render(<OwnerEmailPreviewDialog itineraryId={id} ownerEmail={ownerEmail}/>);fireEvent.click(screen.getByRole('button',{name:'Preview email link'}));};
beforeEach(()=>{mocks.url.mockReturnValue(`/api/itineraries/${id}/email?data_candidate=d1`);vi.stubGlobal('fetch',mocks.fetch);});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
describe('owner email preview dialog',()=>{
 it('keeps recipient fixed and shows an honest saved preview from the actual request contract',async()=>{
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(queued)));open();
  expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByText(email)).not.toBeNull();
  expect(screen.getByText(/No email is sent from this preview/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save preview'}));
  await screen.findByText('Preview saved. No email was sent.');
  expect(mocks.fetch).toHaveBeenCalledWith(`/api/itineraries/${id}/email?data_candidate=d1`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipientEmail:email})});
  expect(screen.queryByRole('button',{name:'Save preview'})).toBeNull();
  expect(screen.queryByText('Email sent!')).toBeNull();
 });
 it('blocks duplicate clicks and closing while the request is pending',async()=>{
  let resolve:(response:Response)=>void=()=>{};mocks.fetch.mockReturnValue(new Promise<Response>(r=>{resolve=r;}));open();
  const save=screen.getByRole('button',{name:'Save preview'});
  act(()=>{fireEvent.click(save);fireEvent.click(save);});
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button',{name:'Saving preview...'}) as HTMLButtonElement).disabled).toBe(true);
  for(const close of screen.getAllByRole('button',{name:'Close'}))fireEvent.click(close);
  expect(screen.getByRole('dialog')).not.toBeNull();
  await act(async()=>{resolve(new Response(JSON.stringify(queued)));});await screen.findByText('Preview saved. No email was sent.');
 });
 it.each([false,'invalid'])('refuses a lost candidate URL or invalid recipient without a fetch (%s)',async value=>{
  if(value===false)mocks.url.mockReturnValue(null);open(value==='invalid'?'real@example.com':email);
  fireEvent.click(screen.getByRole('button',{name:'Save preview'}));await screen.findByRole('alert');
  expect(mocks.fetch).not.toHaveBeenCalled();expect(screen.queryByText('Preview saved. No email was sent.')).toBeNull();
 });
 it.each(['denied','sent','invalid-json','network'])('does not claim success or disclose private errors after %s',async kind=>{
  if(kind==='network')mocks.fetch.mockRejectedValue(Error('private@example.com'));
  else mocks.fetch.mockResolvedValue(new Response(kind==='invalid-json'?'broken':JSON.stringify(kind==='sent'?{success:true,sent:true}:{error:'private@example.com'}),{status:kind==='denied'?503:200}));
  open();fireEvent.click(screen.getByRole('button',{name:'Save preview'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('could not be confirmed'));
  expect(screen.getByRole('dialog').textContent).not.toContain('private@example.com');expect(screen.queryByText('Preview saved. No email was sent.')).toBeNull();
  expect(screen.queryByRole('button',{name:'Save preview'})).toBeNull();expect(mocks.fetch).toHaveBeenCalledTimes(1);
 });
});
