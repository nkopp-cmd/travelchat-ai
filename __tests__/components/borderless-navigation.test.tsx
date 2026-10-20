import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
const state = vi.hoisted(() => ({ pathname:'/spots', loaded:false, signedIn:false }));
vi.mock('next/navigation', () => ({usePathname:()=>state.pathname}));
vi.mock('next/link', () => ({default:({href,...props}:ComponentProps<'a'>)=><a href={href} {...props}/>}));
vi.mock('@/lib/auth/client', () => ({useUser:()=>({isLoaded:state.loaded,isSignedIn:state.signedIn})}));
vi.mock('@/components/auth/user-menu', () => ({UserMenu:()=> <button>Account menu</button>}));
vi.mock('@/components/subscription', () => ({SubscriptionBadge:()=> <span>Current plan</span>}));
vi.mock('@/components/notifications/notification-center', () => ({NotificationCenter:()=> <button>Notifications</button>}));
vi.mock('@/components/brand/logo', () => ({Logo:()=> <span>Localley</span>}));
vi.mock('@/hooks/use-scroll-direction', () => ({useScrollDirection:()=> 'up'}));
import { Navbar } from '@/components/layout/navbar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
beforeEach(()=>{state.pathname='/spots';state.loaded=false;state.signedIn=false;});
describe('borderless navigation state',()=>{
 it('waits for account resolution before showing sign-in or account controls',()=>{
  render(<Navbar/>);expect(screen.getByRole('status',{name:'Checking account'})).not.toBeNull();
  expect(screen.queryByRole('link',{name:'Sign in'})).toBeNull();expect(screen.queryByRole('button',{name:'Account menu'})).toBeNull();
 });
 it('shows the settled account and notification controls',async()=>{
  state.loaded=true;state.signedIn=true;render(<Navbar/>);expect(await screen.findByRole('button',{name:'Account menu'})).not.toBeNull();expect(screen.queryByRole('link',{name:'Sign in'})).toBeNull();
 });
 it('lets a signed-out visitor open the planner and the public catalog',()=>{
  state.loaded=true;render(<Navbar/>);expect(screen.getByRole('link',{name:'Start planning'}).getAttribute('href')).toBe('/itineraries/new');expect(screen.getByRole('link',{name:'Explore'}).getAttribute('href')).toBe('/spots');
 });
 it.each(['/','/spots','/pricing','/itineraries/new'])('uses the same main links on %s',path=>{
  state.pathname=path;state.loaded=true;render(<Navbar/>);const nav=screen.getByRole('navigation',{name:'Main pages'});
  expect(within(nav).getAllByRole('link').map(link=>[link.textContent,link.getAttribute('href')])).toEqual([['Explore','/spots'],['My trips','/itineraries'],['Pricing','/pricing'],['Profile','/profile']]);
 });
 it('gives the drawer a readable title and closes after navigation',async()=>{
  render(<Navbar/>);fireEvent.click(screen.getByRole('button',{name:'Open menu'}));const drawer=await screen.findByRole('dialog',{name:'Explore Localley'});expect(drawer).not.toBeNull();
  for(const label of ['Explore','My trips','Pricing','Profile'])expect(within(drawer).getByRole('link',{name:label})).not.toBeNull();
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
});
