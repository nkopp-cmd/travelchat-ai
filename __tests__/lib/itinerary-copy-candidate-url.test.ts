import {describe,it,expect} from 'vitest';
import {itineraryCopyCandidateUrl} from '@/lib/app-data/itinerary-copy-candidate-url';
const id='ABCDEF00-0000-4000-8000-000000000001',host='localley-next-preview.nkopp.workers.dev';
describe('copy candidate URL',()=>{
 it('requires the exact preview and explicit opt-in',()=>{expect(itineraryCopyCandidateUrl(id,{hostname:host,search:'?data_candidate=d1'})).toBe(`/api/itineraries/${id.toLowerCase()}/duplicate?data_candidate=d1`);});
 it.each(['localley.io','www.localley.io',host+'.evil.test'])('refuses %s',hostname=>{expect(itineraryCopyCandidateUrl(id,{hostname,search:'?data_candidate=d1'})).toBeNull();});
 it.each(['','?data_candidate=other'])('refuses missing opt-in %s',search=>{expect(itineraryCopyCandidateUrl(id,{hostname:host,search})).toBeNull();});
 it('refuses path or URL injection',()=>{expect(itineraryCopyCandidateUrl('../elsewhere',{hostname:host,search:'?data_candidate=d1'})).toBeNull();});
});
