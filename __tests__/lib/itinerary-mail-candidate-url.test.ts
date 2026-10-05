import { describe, expect, it } from 'vitest';
import { itineraryMailCandidateUrl } from '@/lib/app-data/itinerary-mail-candidate-url';
const id='00000000-0000-4000-8000-000000000001',host='localley-next-preview.nkopp.workers.dev';
describe('itinerary owner-mail client opt-in',()=>{
 it('uses only the exact preview host and explicit flag with canonical UUID',()=>{
  expect(itineraryMailCandidateUrl(id.toUpperCase(),{hostname:host,search:'?other=1&data_candidate=d1'})).toBe(`/api/itineraries/${id}/email?data_candidate=d1`);
 });
 it('refuses normal preview, www, apex, lookalikes and other flags without a source URL',()=>{
  for(const hostname of ['www.localley.io','localley.io','other.workers.dev',host+'.evil.test'])expect(itineraryMailCandidateUrl(id,{hostname,search:'?data_candidate=d1'})).toBeNull();
  for(const search of ['', '?data_candidate=source','?data_candidate=d1x'])expect(itineraryMailCandidateUrl(id,{hostname:host,search})).toBeNull();
 });
 it('refuses unsafe or missing IDs without constructing a route',()=>{
  for(const value of ['','../other',id+'/email',id+'?data_candidate=d1'])expect(itineraryMailCandidateUrl(value,{hostname:host,search:'?data_candidate=d1'})).toBeNull();
 });
});
