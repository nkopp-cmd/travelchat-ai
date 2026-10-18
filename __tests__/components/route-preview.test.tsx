import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoutePreview } from "@/components/itineraries/wizard/route-preview";
const state = vi.hoisted(() => ({data:{citySlugs:["seoul","busan"],days:6,budget:"moderate",pace:"moderate",groupType:"solo",interests:[],cityNameBySlug:{seoul:"Seoul",busan:"Busan",gyeongju:"Gyeongju"}}}));
vi.mock("@/components/itineraries/wizard/wizard-context", () => ({useWizard:()=>state}));
const preview=(name:string)=>({ok:true,preview:{stops:[{position:0,destinationSlug:name,nights:2,dayIndexes:[0,1]}],transfers:[],warnings:[]}});

describe("route preview request isolation", () => {
  beforeEach(()=>{vi.useFakeTimers();state.data.citySlugs=["seoul","busan"];state.data.days=6;});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
  it("clears the prior displayed route immediately when the selection changes",async()=>{
    const fetcher=vi.fn().mockResolvedValue({json:async()=>preview("seoul")});vi.stubGlobal("fetch",fetcher);
    const view=render(<RoutePreview/>);await act(async()=>{await vi.advanceTimersByTimeAsync(400)});
    expect(screen.getByText("Seoul")).toBeTruthy();
    state.data.citySlugs=["seoul","gyeongju"];view.rerender(<RoutePreview/>);
    expect(screen.queryByText("Seoul")).toBeNull();expect(screen.getByText("Optimizing route…")).toBeTruthy();
    state.data.citySlugs=["seoul"];view.rerender(<RoutePreview/>);await act(async()=>{await vi.advanceTimersByTimeAsync(500)});
    expect(fetcher).toHaveBeenCalledTimes(1);expect(view.container.textContent).toBe("");
  });
  it("aborts a superseded request and ignores a late response",async()=>{
    let finish:(value:unknown)=>void=()=>{};
    const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({json:async()=>preview("gyeongju")});vi.stubGlobal("fetch",fetcher);
    const view=render(<RoutePreview/>);await act(async()=>{await vi.advanceTimersByTimeAsync(400)});
    const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
    state.data.citySlugs=["seoul","gyeongju"];view.rerender(<RoutePreview/>);expect(signal.aborted).toBe(true);
    await act(async()=>{await vi.advanceTimersByTimeAsync(400)});expect(screen.getByText("Gyeongju")).toBeTruthy();
    await act(async()=>{finish({json:async()=>preview("busan")})});expect(screen.queryByText("Busan")).toBeNull();expect(screen.getByText("Gyeongju")).toBeTruthy();
  });
});
