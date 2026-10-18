import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeartIcon } from "@phosphor-icons/react/dist/ssr/Heart";
import { MapPinIcon } from "@phosphor-icons/react/dist/ssr/MapPin";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Heart, MapPin, ArrowRight } from "@/components/ui/icons";

describe("approved icon weights",()=>{
  it.each(["fill","duotone"] as const)("preserves pinned Phosphor geometry for %s",weight=>{
    for(const [Local,Original] of [[Heart,HeartIcon],[MapPin,MapPinIcon],[ArrowRight,ArrowRightIcon]] as const){
      const local=document.createElement("div"),source=document.createElement("div");
      local.innerHTML=renderToStaticMarkup(<Local weight={weight}/>);source.innerHTML=renderToStaticMarkup(<Original weight={weight}/>);
      expect(local.querySelector("svg")!.innerHTML).toBe(source.querySelector("svg")!.innerHTML);
    }
  });
  it("hides decorative icons and preserves meaningful labels and sizing",()=>{
    const box=document.createElement("div");box.innerHTML=renderToStaticMarkup(<><Heart/><Heart alt="Saved place" size={32} mirrored/></>);
    const icons=box.querySelectorAll("svg");expect(icons[0].getAttribute("aria-hidden")).toBe("true");expect(icons[1].getAttribute("aria-hidden")).toBeNull();expect(icons[1].querySelector("title")?.textContent).toBe("Saved place");expect(icons[1].getAttribute("width")).toBe("32");expect(icons[1].getAttribute("transform")).toBe("scale(-1, 1)");
  });
});
