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

    expect(
      cleanChatItineraryDescription("Start with coffee.\nWhere - Cafe Onion Anguk, Jongno-gu, Seoul\n\u{1F4CD} Seoul Forest, Seoul")
    ).toBe("Start with coffee.");
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

  it("parses dash day headings and map-pin address labels", () => {
    const result = parseChatItineraryPreview(`# Taipei Hidden Gems

### Day 1 - Tea & Alleys
- **Wistaria Tea House (Hidden Gem)**: Order oolong in the old Japanese-era residence.
  \u{1F4CD} Wistaria Tea House, Da'an District, Taipei

Before you go
- Book tea service on weekends.
`);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].day).toBe("Day 1 - Tea & Alleys");
    expect(result.days[0].activities[0]).toMatchObject({
      title: "Wistaria Tea House",
      address: "Wistaria Tea House, Da'an District, Taipei",
    });
    expect(result.tips).toEqual(["Book tea service on weekends."]);
  });

  it("keeps getting-there and where rows out of saved day activities", () => {
    const result = parseChatItineraryPreview(`# Seoul Hidden Gems

**Day 1 \u2014 Cafes**
- **Cafe Onion Anguk (Local Favorite)**: Start with coffee and pastries in the hanok courtyard.
  Where - Cafe Onion Anguk, Jongno-gu, Seoul
- Getting there: Walk from Anguk Station exit 3.
`);

    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      "Cafe Onion Anguk",
    ]);
    expect(result.days[0].activities[0].address).toBe("Cafe Onion Anguk, Jongno-gu, Seoul");
    expect(result.tips).toEqual(["Getting there: Walk from Anguk Station exit 3."]);
  });

  it("keeps plain lines inside tips sections outside day activities", () => {
    const result = parseChatItineraryPreview(`# Osaka Hidden Gems

**Day 1: Food Alleys**
- **Kuromon Market (Local Favorite)**: Start with named seafood stalls.
  Address: Kuromon Market, Chuo Ward, Osaka

**Local Tips**
Bring cash for smaller counters.
What to order: grilled scallops before noon.
Getting around: Use Nippombashi Station exit 10.
`);

    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      "Kuromon Market",
    ]);
    expect(result.tips).toEqual([
      "Bring cash for smaller counters.",
      "What to order: grilled scallops before noon.",
      "Getting around: Use Nippombashi Station exit 10.",
    ]);
  });

  it("keeps numbered practical rows outside day activities", () => {
    const result = parseChatItineraryPreview(`# Seoul Hidden Gems

### Day 1: Cafes
1. **Cafe Onion Anguk (Local Favorite)**: Start with coffee in the hanok courtyard.
   Address: Cafe Onion Anguk, Jongno-gu, Seoul
2. Getting around - Walk from Anguk Station exit 3.
3. Tip - Bring cash for the smaller nearby shops.

### Local Tips:
1. Book tea service on weekends.
2. What to order - seasonal tea before noon.
`);

    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      "Cafe Onion Anguk",
    ]);
    expect(result.days[0].activities[0].address).toBe("Cafe Onion Anguk, Jongno-gu, Seoul");
    expect(result.tips).toEqual([
      "Getting around: Walk from Anguk Station exit 3.",
      "Tip: Bring cash for the smaller nearby shops.",
      "Book tea service on weekends.",
      "What to order: seasonal tea before noon.",
    ]);
  });

  it("moves standalone practical label rows into tips even without bullets", () => {
    const result = parseChatItineraryPreview(`# Busan Hidden Gems

**Day 1: Markets**
- **Bupyeong Kkangtong Market (Hidden Gem)**: Eat through named stalls after dark.
  Address: Bupyeong Kkangtong Market, Jung-gu, Busan
What to order: seed hotteok and eomuk.
Booking note: No reservations needed, but go before peak dinner.
`);

    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      "Bupyeong Kkangtong Market",
    ]);
    expect(result.tips).toEqual([
      "What to order: seed hotteok and eomuk.",
      "Booking note: No reservations needed, but go before peak dinner.",
    ]);
  });

  it("drops day sections that only contain notes after filtering", () => {
    const result = parseChatItineraryPreview(`# Seoul Hidden Gems

**Day 1: Practical setup**
- Bring cash for smaller vendors.
- Getting around: Use the subway.

**Day 2: Real stops**
- **Ikseon Teahouse (Hidden Gem)**: Order seasonal tea.
  Address: Ikseon-dong, Jongno-gu, Seoul
`);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].day).toBe("Day 2: Real stops");
    expect(result.days[0].activities[0].title).toBe("Ikseon Teahouse");
    expect(result.tips).toEqual([
      "Bring cash for smaller vendors.",
      "Getting around: Use the subway.",
    ]);
  });

  it("classifies chat tips for saved itinerary insights", () => {
    expect(getChatTipKind("Use the subway and walk the last few blocks.")).toBe("transport");
    expect(getChatTipKind("Bring cash and go early.")).toBe("local");
    expect(getChatTipKind("Pack a small umbrella in rainy season.")).toBe("insight");
  });
});
