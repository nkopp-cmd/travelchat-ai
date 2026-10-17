import { act,cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({url:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/app-data/itinerary-copy-candidate-url',()=>({itineraryCopyCandidateUrl:m.url}));
import { PreviewCopyButton } from '@/components/itineraries/preview-copy-button';
const id='00000000-0000-4000-8000-000000000001',copyId='00000000-0000-4000-8000-000000000002';
const saved={id:copyId,clerk_user_id:'a',status:'draft',shared:false,is_public:false,is_favorite:false,share_code:null};
const show=(title='Private tea trip',actorId='a')=>render(<PreviewCopyButton itineraryId={id} actorId={actorId} title={title}/>);
const response=(data:unknown=saved,source='d1-preview',status=200)=>new Response(JSON.stringify(data),{status,headers:{'X-Localley-Data-Source':source}});
beforeEach(()=>{m.url.mockReturnValue(`/api/itineraries/${id}/duplicate?data_candidate=d1`);vi.stubGlobal('fetch',m.fetch);});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
describe('candidate copy action',()=>{
 it('makes one owner-bound request and links to the saved private copy with opt-in',async()=>{
  m.fetch.mockResolvedValue(response());show();fireEvent.click(screen.getByRole('button',{name:'Make a copy'}));
  const link=await screen.findByRole('link',{name:'View copy'});expect(link.getAttribute('href')).toBe(`/itineraries/${copyId}?data_candidate=d1`);
  expect(m.fetch).toHaveBeenCalledWith(`/api/itineraries/${id}/duplicate?data_candidate=d1`,expect.objectContaining({method:'POST',credentials:'same-origin',headers:{'X-Localley-Preview-Actor':'a'},signal:expect.any(AbortSignal)}));
  expect((screen.getByRole('button',{name:'Copy saved'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Copy saved'}));expect(m.fetch).toHaveBeenCalledTimes(1);
 });
 it('blocks two rapid clicks before a rerender',async()=>{
  let done:(r:Response)=>void=()=>{};m.fetch.mockReturnValue(new Promise<Response>(r=>{done=r;}));show();
  const button=screen.getByRole('button',{name:'Make a copy'});act(()=>{fireEvent.click(button);fireEvent.click(button);});
  expect(m.fetch).toHaveBeenCalledTimes(1);expect((screen.getByRole('button',{name:'Copying...'}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>{done(response());});expect(await screen.findByRole('link',{name:'View copy'})).not.toBeNull();
 });
 it.each(['gate','actor'])('refuses missing %s before any request',async kind=>{
  if(kind==='gate')m.url.mockReturnValue(null);show('Trip',kind==='actor'?'':'a');fireEvent.click(screen.getByRole('button',{name:'Make a copy'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Copy is unavailable here.');expect(m.fetch).not.toHaveBeenCalled();
 });
 it.each(['network','json','denied','source','foreign','public','same-id','bad-id'])('does not claim or retry an uncertain copy (%s)',async kind=>{
  if(kind==='network')m.fetch.mockRejectedValue(Error('private@example.com'));
  else if(kind==='json')m.fetch.mockResolvedValue(new Response('private@example.com'));
  else m.fetch.mockResolvedValue(response(kind==='foreign'?{...saved,clerk_user_id:'b'}:kind==='public'?{...saved,is_public:true}:kind==='same-id'?{...saved,id}:kind==='bad-id'?{...saved,id:'https://evil.test'}:saved,kind==='source'?'source':'d1-preview',kind==='denied'?403:200));
  show();fireEvent.click(screen.getByRole('button',{name:'Make a copy'}));
  const alert=await screen.findByRole('alert');expect(alert.textContent).toContain('Could not confirm');expect(alert.textContent).not.toContain('private@example.com');
  expect(screen.getByRole('link',{name:'Check your trips'}).getAttribute('href')).toBe('/itineraries?data_candidate=d1');
  expect(screen.queryByRole('link',{name:'View copy'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Make a copy'}));expect(m.fetch).toHaveBeenCalledTimes(1);
 });
 it('aborts a stalled request after25seconds and does not retry it',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;
  try{
   m.fetch.mockImplementation((_url:string,options:{signal:AbortSignal})=>new Promise<Response>((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(Error('aborted')));}));
   show();fireEvent.click(screen.getByRole('button',{name:'Make a copy'}));
   await act(async()=>{await vi.advanceTimersByTimeAsync(25000);});
   expect(signal?.aborted).toBe(true);expect(screen.getByRole('alert').textContent).toContain('Could not confirm');
   fireEvent.click(screen.getByRole('button',{name:'Make a copy'}));expect(m.fetch).toHaveBeenCalledTimes(1);
  }finally{vi.useRealTimers();}
 });
 it('prevents a copy whose title cannot open on the bounded detail page',()=>{
  show('x'.repeat(194));expect(screen.queryByRole('button',{name:'Make a copy'})).toBeNull();expect(screen.getByText('Shorten the title before making a copy.')).not.toBeNull();expect(m.fetch).not.toHaveBeenCalled();
 });
 it('allows the longest title that fits with the copy suffix',()=>{show('x'.repeat(193));expect(screen.getByRole('button',{name:'Make a copy'})).not.toBeNull();});
});
