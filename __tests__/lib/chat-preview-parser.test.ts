import { describe, expect, it } from "vitest";
import {
  cleanChatItineraryDescription,
  getChatTipKind,
  parseChatItineraryPreview,
} from "@/lib/itineraries/chat-preview-parser";

describe("parseChatItineraryPreview", () => {
  it("preserves address lines as activity addresses instead of dropping them", () => {
    const result = parseChatItineraryPreview(`# Seoul Hidden Gems

**Day 1: Markets & Alleys**

- **Gwangjang Market (Hidden Gem)**: Try bindaetteok and mayak gimbap before the lunch rush.
  Address: Gwangjang Market, Jongno-gu, Seoul

**Local Tips**
- Bring small bills.
`);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].activities[0]).toMatchObject({
      title: "Gwangjang Market",
      address: "Gwangjang Market, Jongno-gu, Seoul",
    });
    expect(result.tips).toEqual(["Bring small bills."]);
  });

  it("keeps practical tips out of day activities even when the model emits them inline", () => {
    const result = parseChatItineraryPreview(`# Tokyo Hidden Gems

**Day 1: Local Food**

- **Tsukiji Outer Market (Local Favorite)**: Snack through named stalls in the morning.
  Address: Tsukiji Outer Market, Chuo City, Tokyo
- **Getting around**: Use the subway and walk the last few blocks.
- **Lunch**: Avoid peak hour if you want shorter queues.

**Getting Around**
- Get a Suica card before the first train ride.
`);

    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      "Tsukiji Outer Market",
    ]);
    expect(result.tips).toEqual([
      "Getting around: Use the subway and walk the last few blocks.",
      "Lunch: Avoid peak hour if you want shorter queues.",
      "Get a Suica card before the first train ride.",
    ]);
  });

  it("keeps plain practical bullet rows out of day activities", () => {
    const result = parseChatItineraryPreview(`# Taipei Hidden Gems

**Day 1: Local Food**

- **Yongkang Beef Noodle (Local Favorite)**: Order the half-spicy bowl.
  Address: Yongkang Beef Noodle, Da'an District, Taipei
- Bring cash for smaller vendors.
- Use the MRT between stops.
`);

    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      "Yongkang Beef Noodle",
    ]);
    expect(result.tips).toEqual([
      "Bring cash for smaller vendors.",
      "Use the MRT between stops.",
    ]);
  });

  it("keeps indented practical notes out of activity descriptions", () => {
    const result = parseChatItineraryPreview(`# Seoul Hidden Gems

**Day 1: Small Places**

- **Ikseon Teahouse (Hidden Gem)**: Order seasonal tea before the afternoon rush.
  Address: Ikseon-dong, Jongno-gu, Seoul
  Tip: Bring cash for smaller shops.
  Getting around: Walk from Jongno 3-ga exit 4.
  The hanok courtyard is best for photos.
`);

    const activity = result.days[0].activities[0];

    expect(activity.address).toBe("Ikseon-dong, Jongno-gu, Seoul");
    expect(activity.description).toBe(
      "Order seasonal tea before the afternoon rush.\nThe hanok courtyard is best for photos."
    );
    expect(result.tips).toEqual([
      "Tip: Bring cash for smaller shops.",
      "Getting around: Walk from Jongno 3-ga exit 4.",
    ]);
  });

  it("pulls labeled tips out of activity descriptions before preview or save", () => {
    const result = parseChatItineraryPreview(`# Seoul Hidden Gems

**Day 1: Cafes**

- **Ikseon Teahouse (Hidden Gem)**: Order seasonal tea before the afternoon rush. Tip: Bring cash for smaller shops.
  Address: Ikseon-dong, Jongno-gu, Seoul
`);

    expect(result.days[0].activities[0]).toMatchObject({
      title: "Ikseon Teahouse",
      description: "Order seasonal tea before the afternoon rush.",
      address: "Ikseon-dong, Jongno-gu, Seoul",
    });
    expect(result.tips).toEqual(["Tip: Bring cash for smaller shops."]);
  });

  it("removes address and location lines from the preview description", () => {
    expect(
      cleanChatItineraryDescription("Go early.\nAddress: Ikseon-dong, Jongno-gu, Seoul\nOrder the seasonal tea.")
    ).toBe("Go early. Order the seasonal tea.");
  });

  it("parses plain day headings without requiring markdown decoration", () => {
    const result = parseChatItineraryPreview(`# Taipei Hidden Gems

Day 1: Food Streets
- Yongkang Beef Noodle (Local Favorite): Order the half-spicy bowl.
  Address: Yongkang Beef Noodle, Da'an District, Taipei
`);

    expect(result.days[0].day).toBe("Day 1: Food Streets");
    expect(result.days[0].activities[0].address).toBe("Yongkang Beef Noodle, Da'an District, Taipei");
  });

  it("classifies chat tips for saved itinerary insights", () => {
    expect(getChatTipKind("Use the subway and walk the last few blocks.")).toBe("transport");
    expect(getChatTipKind("Bring cash and go early.")).toBe("local");
    expect(getChatTipKind("Pack a small umbrella in rainy season.")).toBe("insight");
  });
});
