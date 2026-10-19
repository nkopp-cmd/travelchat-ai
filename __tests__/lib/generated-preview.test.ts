import { describe, expect, it } from "vitest";
import { GENERATED_PREVIEW_KEY, parseGeneratedPreview, storeGeneratedPreview } from "@/lib/trips/generated-preview";
const plan = { title: "Seoul afternoon", city: "Seoul", days: 1, dailyPlans: [{ day: 1, theme: "A quiet afternoon", activities: [{ name: "A sourced stop", description: "Walk here", time: "10:00", address: "Original address" }] }] };
const id = "550e8400-e29b-41d4-a716-446655440000";
describe("generated trip browser recovery", () => {
 it("retains all generated activity details and one stable save ID through auth/payment", () => {
  let raw="";storeGeneratedPreview({setItem:(key,value)=>{expect(key).toBe(GENERATED_PREVIEW_KEY);raw=value;}},plan,100,id);
  expect(parseGeneratedPreview(raw,101)).toMatchObject({id,itinerary:plan});
 });
 it("refuses corrupt, future, expired and oversized drafts", () => {
  let raw="";storeGeneratedPreview({setItem:(_,v)=>{raw=v;}},plan,100,id);
  for(const [value,now] of [[raw,99],[raw,86_400_100],["{",100],["x".repeat(512001),100]] as const)expect(parseGeneratedPreview(value,now)).toBeNull();
 });
 it("refuses malformed plans and surfaces storage failure before claiming a save", () => {
  expect(()=>storeGeneratedPreview({setItem:()=>{}},{...plan,dailyPlans:[]},100,id)).toThrow();
  expect(()=>storeGeneratedPreview({setItem:()=>{throw Error('full');}},plan,100,id)).toThrow('full');
 });
});
