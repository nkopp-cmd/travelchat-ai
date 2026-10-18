import { createRoot } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SpotCard } from '../components/spots/spot-card';
import { WeeklyTrendingSpots } from '../components/spots/weekly-trending-spots';
import { transformSpot, type RawSpot } from '../lib/spots/transform';
import fixture from './spot-card-public-fixtures.json';
import '../app/globals.css';
import '../styles/borderless-tokens.css';
import '../styles/borderless-theme.css';

document.addEventListener('click',event=>{
  const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if(!link)return;
  (window as Window & {__previewNavigation?:unknown}).__previewNavigation={trusted:event.isTrusted,href:link.getAttribute('href')};
  event.preventDefault();event.stopImmediatePropagation();
  document.querySelector('#component-preview-status')!.textContent='Navigation requested: '+link.getAttribute('href');
},true);

const spots = fixture.rows.map(row => transformSpot({...row, location:null, photos:[], tips:[], subcategories:[]} as RawSpot));
const router = {
  bfcacheId: "internal-component-preview",
  back(){}, forward(){}, refresh(){}, hmrRefresh(){}, prefetch(){},
  push(href:string){document.querySelector('#component-preview-status')!.textContent='Navigation requested: '+href;},
  replace(href:string){document.querySelector('#component-preview-status')!.textContent='Navigation requested: '+href;},
};
createRoot(document.getElementById('root')!).render(<AppRouterContext.Provider value={router}>
  <main style={{paddingBottom:"calc(5rem + env(safe-area-inset-bottom,0px))"}} className="mx-auto max-w-6xl space-y-8 p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
    <header><p className="text-sm text-muted-foreground">Internal component check. Real shared cards with public text fixtures. Photos deliberately absent. Navigation is captured; no account or trip changes.</p><h1 className="mt-4 text-3xl">A little room for discovery.</h1></header>
    <WeeklyTrendingSpots items={spots.map((spot,index)=>({spot,citySlug:'seoul',rank:index+1,score:1,postCount:1,platformCount:1}))} />
    <section aria-label="Catalog grid" className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">{spots.map(spot=><SpotCard key={spot.id} spot={spot} />)}</section>
    <section aria-label="Catalog list"><SpotCard spot={spots[0]} compact /></section>
    <p id="component-preview-status" role="status" className="text-sm text-muted-foreground" />
  </main>
  <nav aria-label="Test bottom navigation" className="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around bg-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden">
    {['Explore','Chat','My trips'].map(label=><button key={label} type="button" className="min-h-11 rounded-lg px-4 text-sm">{label}</button>)}
  </nav>
</AppRouterContext.Provider>);
