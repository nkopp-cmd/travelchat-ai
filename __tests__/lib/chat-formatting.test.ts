import { describe, expect, it } from "vitest";
import { isItineraryContent } from "@/lib/chat-formatting";

describe("isItineraryContent", () => {
    it("detects plain day headings as itinerary previews", () => {
        const content = [
            "# Taipei Hidden Gems",
            "",
            "Day 1: Food Streets",
            "- Yongkang Beef Noodle: Order the half-spicy bowl.",
            "Address: Yongkang Street, Taipei",
            "- Dadaocheng Wharf: Go near sunset.",
            "Address: Dadaocheng, Taipei",
            "",
            "Day 2: Local Markets",
            "- Nanmen Market: Try the ready-made snacks.",
            "Address: Zhongzheng District, Taipei",
            "",
        ].join("\n");

        expect(isItineraryContent(content)).toBe(true);
    });

    it("does not treat a short day mention as a full itinerary", () => {
        expect(isItineraryContent("Day 1: arrive and rest.")).toBe(false);
    });
});
