import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HelpMenuPage from "@/app/help/[country]/menu/page";
import { helpCountry, helpPhrases } from "@/lib/help/phrases";

// React error #418 on the live page: the inline script wrote into server-rendered nodes before hydration.
describe("help menu page hydration", () => {
  it("renders the order phrase on the server and the inline script changes nothing before a user action", async () => {
    const country = helpCountry("korea")!;
    const order = helpPhrases(country).flatMap((group) => group.phrases).find((phrase) => phrase.id === "order_this")!;
    const html = renderToStaticMarkup(await HelpMenuPage({ params: Promise.resolve({ country: "korea" }) }));
    document.body.innerHTML = html;
    const card = document.getElementById("menu-card")!;
    expect(card.textContent).toContain(order.text);
    expect(card.textContent).toContain(order.en);

    const before = document.body.innerHTML;
    const script = document.querySelector("script")!;
    new Function(script.textContent ?? "")();
    expect(document.body.innerHTML).toBe(before);
  });
});
