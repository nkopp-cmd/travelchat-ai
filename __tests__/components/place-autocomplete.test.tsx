import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceAutocomplete } from "@/components/ui/place-autocomplete";
vi.mock("@/lib/maps/places-readiness",()=>({subscribePlaces:()=>()=>{},placesSnapshot:()=>"ready",placesServerSnapshot:()=>"idle"}));
afterEach(()=>vi.unstubAllGlobals());

describe("PlaceAutocomplete",()=>{
  it("keeps its SDK instance while typing and uses the latest callback",()=>{
    let changed=()=>{};const remove=vi.fn(),clear=vi.fn();const place={name:"Seoul"};
    const constructor=vi.fn(function(){return{addListener:(_event:string,callback:()=>void)=>{changed=callback;return{remove};},getPlace:()=>place};});
    vi.stubGlobal("google",{maps:{places:{Autocomplete:constructor},event:{clearInstanceListeners:clear}}});
    const old=vi.fn(),latest=vi.fn();const view=render(<PlaceAutocomplete value="" onChange={old}/>);
    expect(constructor).toHaveBeenCalledTimes(1);view.rerender(<PlaceAutocomplete value="S" types={["(cities)"]} onChange={latest}/>);
    expect(constructor).toHaveBeenCalledTimes(1);changed();expect(latest).toHaveBeenCalledWith("Seoul",place);expect(old).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"Manual place"}});expect(latest).toHaveBeenCalledWith("Manual place");
    view.unmount();expect(remove).toHaveBeenCalledTimes(1);expect(clear).toHaveBeenCalledTimes(1);
  });
});
