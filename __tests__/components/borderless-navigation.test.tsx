import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const state = vi.hoisted(() => ({ pathname:'/spots', loaded:false, signedIn:false }));
vi.mock('next/navigation', () => ({usePathname:()=>state.pathname, useRouter:()=>({prefetch:()=>{}})}));
vi.mock('next/link', () => ({default:({href,...props}:ComponentProps<'a'>)=><a href={href} {...props}/>}));
vi.mock('@/lib/auth/client', () => ({useUser:()=>({isLoaded:state.loaded,isSignedIn:state.signedIn})}));
vi.mock('@/components/auth/user-menu', () => ({UserMenu:()=> <button>Account menu</button>}));
vi.mock('@/components/subscription', () => ({SubscriptionBadge:()=> <span>Current plan</span>}));
vi.mock('@/components/notifications/notification-center', () => ({NotificationCenter:()=> <button>Notifications</button>}));
vi.mock('@/components/brand/logo', () => ({Logo:()=> <span>Localley</span>}));
vi.mock('@/hooks/use-scroll-direction', () => ({useScrollDirection:()=> 'up'}));
import { Navbar } from '@/components/layout/navbar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
beforeEach(()=>{state.pathname='/spots';state.loaded=false;state.signedIn=false;localStorage.clear();});
describe('borderless navigation state',()=>{
 it('a browser that had a signed-in header waits for account resolution before showing sign-in or account controls',()=>{
  localStorage.setItem('localley:account-hint','1');render(<Navbar/>);expect(screen.getByRole('status',{name:'Checking account'})).not.toBeNull();
  expect(screen.queryByRole('link',{name:'Sign in'})).toBeNull();expect(screen.queryByRole('button',{name:'Account menu'})).toBeNull();
 });
 it('a new visitor sees Sign in and Join free before the session returns (Push BE1)',()=>{
  state.pathname='/pricing';render(<Navbar/>);expect(screen.queryByRole('status',{name:'Checking account'})).toBeNull();
  expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe('/sign-in?redirect_url=%2Fpricing');expect(screen.getByRole('link',{name:'Join free'}).getAttribute('href')).toBe('/sign-up?redirect_url=%2Fpricing');
 });
 it('sets the hint after a signed-in render and clears it after a signed-out one (Push BE1)',async()=>{
  state.loaded=true;state.signedIn=true;const view=render(<Navbar/>);await waitFor(()=>expect(localStorage.getItem('localley:account-hint')).toBe('1'));view.unmount();
  state.signedIn=false;render(<Navbar/>);await waitFor(()=>expect(localStorage.getItem('localley:account-hint')).toBeNull());
 });
 it('shows the settled account and notification controls',async()=>{
  state.loaded=true;state.signedIn=true;render(<Navbar/>);expect(await screen.findByRole('button',{name:'Account menu'})).not.toBeNull();expect(screen.queryByRole('link',{name:'Sign in'})).toBeNull();
 });
 it('lets a signed-out visitor open the planner and the public catalog',()=>{
  state.loaded=true;render(<Navbar/>);expect(screen.getByRole('link',{name:'Start planning'}).getAttribute('href')).toBe('/itineraries/new');expect(screen.getByRole('link',{name:'Explore'}).getAttribute('href')).toBe('/spots');
 });
 it.each([['/spots','/spots'],['/','/'],['/sign-up','/'],['/sign-in','/'],['/help/japan/menu','/help/japan/menu']])('gives a signed-out visitor on %s a Join free link that returns to %s (Push AF3)',(path,back)=>{
  state.pathname=path;state.loaded=true;render(<Navbar/>);const join=screen.getByRole('link',{name:'Join free'});
  expect(join.getAttribute('href')).toBe(`/sign-up?redirect_url=${encodeURIComponent(back)}`);expect(join.className).toContain('sm:hidden');
 });
 it.each([['/pricing','/sign-in?redirect_url=%2Fpricing'],['/itineraries/abc','/sign-in?redirect_url=%2Fitineraries%2Fabc'],['/','/sign-in'],['/sign-in','/sign-in'],['/sign-up/verify','/sign-in']])('gives a signed-out visitor on %s a Sign in link %s (Push BR1)',(path,href)=>{
  state.pathname=path;state.loaded=true;render(<Navbar/>);expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe(href);
 });
 it('keeps the query on Join free and Sign in after intent, and drops it after a navigation (Push BR2)',()=>{
  window.history.replaceState(null,'','/spots?city=tokyo');state.pathname='/spots';state.loaded=true;const view=render(<Navbar/>);
  const join=screen.getByRole('link',{name:'Join free'});const signIn=screen.getByRole('link',{name:'Sign in'});
  expect(join.getAttribute('href')).toBe('/sign-up?redirect_url=%2Fspots');
  fireEvent.pointerDown(join);expect(join.getAttribute('href')).toBe('/sign-up?redirect_url=%2Fspots%3Fcity%3Dtokyo');
  expect(signIn.getAttribute('href')).toBe('/sign-in?redirect_url=%2Fspots%3Fcity%3Dtokyo');
  window.history.replaceState(null,'','/pricing');state.pathname='/pricing';view.rerender(<Navbar/>);
  expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe('/sign-in?redirect_url=%2Fpricing');
  window.history.replaceState(null,'','/?ref=x');state.pathname='/';view.rerender(<Navbar/>);fireEvent.focus(screen.getByRole('link',{name:'Sign in'}));
  expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe('/sign-in');expect(screen.getByRole('link',{name:'Join free'}).getAttribute('href')).toBe('/sign-up?redirect_url=%2F');
  window.history.replaceState(null,'','/');
 });
 it('hides Join free while a known member account loads and for signed-in members',()=>{
  localStorage.setItem('localley:account-hint','1');const view=render(<Navbar/>);expect(screen.queryByRole('link',{name:'Join free'})).toBeNull();view.unmount();
  state.loaded=true;state.signedIn=true;render(<Navbar/>);expect(screen.queryByRole('link',{name:'Join free'})).toBeNull();
 });
 it.each(['/pricing','/spots','/itineraries/abc','/blog/paying-in-seoul'])('header auth links on %s carry a same-origin redirect_url to that page (Push BR4)',path=>{
  state.pathname=path;state.loaded=true;render(<Navbar/>);const q=encodeURIComponent(path);
  expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe(`/sign-in?redirect_url=${q}`);expect(screen.getByRole('link',{name:'Join free'}).getAttribute('href')).toBe(`/sign-up?redirect_url=${q}`);
 });
 it.each(['/','/sign-in','/sign-up','//evil.example','/\\evil.example'])('header auth links on %s carry no return target (Push BR4)',path=>{
  state.pathname=path;state.loaded=true;render(<Navbar/>);
  expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe('/sign-in');expect(screen.getByRole('link',{name:'Join free'}).getAttribute('href')).toBe('/sign-up?redirect_url=%2F');
 });
 it.each(['/','/spots','/pricing','/itineraries/new'])('uses the same main links on %s',path=>{
  state.pathname=path;state.loaded=true;render(<Navbar/>);const nav=screen.getByRole('navigation',{name:'Main pages'});
  expect(within(nav).getAllByRole('link').map(link=>[link.textContent,link.getAttribute('href')])).toEqual([['Explore','/spots'],['My trips','/itineraries'],['Help','/help'],['Pricing','/pricing'],['Profile','/profile']]);
 });
 it('gives the drawer a readable title and closes after navigation',async()=>{
  render(<Navbar/>);fireEvent.click(screen.getByRole('button',{name:'Open menu'}));const drawer=await screen.findByRole('dialog',{name:'Explore Localley'});expect(drawer).not.toBeNull();
  for(const label of ['Explore','My trips','Help','Pricing','Profile'])expect(within(drawer).getByRole('link',{name:label})).not.toBeNull();
  fireEvent.click(screen.getByRole('link',{name:'Templates'}));expect(screen.queryByRole('dialog')).toBeNull();
 });
 it.each(['/spots','/spots/place-id','/dashboard'])('marks public Explore active for %s',path=>{
  state.pathname=path;render(<MobileBottomNav/>);const link=screen.getByRole('link',{name:'Explore'});expect(link.getAttribute('href')).toBe('/spots');expect(link.getAttribute('aria-current')).toBe('page');
 });
 it('keeps the planner free of bottom navigation',()=>{
  state.pathname='/itineraries/new';render(<MobileBottomNav/>);expect(screen.queryByRole('navigation')).toBeNull();
 });
 it('keeps signed-in account controls out of the shared navbar chunk',()=>{
  const source=readFileSync('components/layout/navbar.tsx','utf8');
  expect(source).not.toMatch(/@\/components\/(auth\/user-menu|subscription|notifications)/);expect(source).toMatch(/dynamic\(\(\) => import\("@\/components\/layout\/navbar-account"\)/);
 });
 it('returns focus to the menu button when the drawer closes',async()=>{
  render(<Navbar/>);const button=screen.getByRole('button',{name:'Open menu'});button.focus();fireEvent.click(button);
  const drawer=await screen.findByRole('dialog',{name:'Explore Localley'});expect(button.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(drawer,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(document.activeElement).toBe(button));expect(button.getAttribute('aria-expanded')).toBe('false');
 });
 it('loads the mobile drawer (Radix Dialog) only on demand',()=>{
  const source=readFileSync('components/layout/navbar.tsx','utf8');
  expect(source).not.toMatch(/@\/components\/ui\/sheet|@radix-ui/);expect(source).toMatch(/import\("@\/components\/layout\/navbar-drawer"\)/);
 });
});
