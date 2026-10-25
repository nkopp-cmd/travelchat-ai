import { describe, expect, it } from "vitest";
import { driverCard } from "@/lib/help/driver-card";
import translations from "@/lib/help/translations.json";

describe("show-to-driver card", () => {
  it("uses the local-name key first and the reviewed request phrase", () => {
    const card = driverCard({ name: "Gwangjang Market", nameField: { en: "Gwangjang Market", ko: "광장시장" }, address: "88 Changgyeonggung-ro, Jongno-gu, Seoul" });
    expect(card).toMatchObject({ language: "ko", localName: "광장시장", name: "Gwangjang Market", request: translations.take_me_here.ko });
  });

  it("falls back to the country in the address when there is no local name", () => {
    expect(driverCard({ name: "Fuunji", nameField: { en: "Fuunji" }, address: "2-14-3 Yoyogi, Shibuya City, Tokyo, Japan" }))
      .toMatchObject({ language: "ja", localName: null, request: translations.take_me_here.ja });
    expect(driverCard({ name: "Jay Fai", nameField: "Jay Fai", address: "327 Maha Chai Rd, Bangkok 10200, Thailand" }).language).toBe("th");
    expect(driverCard({ name: "Ben Thanh", nameField: null, address: "Le Loi, District 1, Ho Chi Minh City, Vietnam" }).language).toBe("vi");
    expect(driverCard({ name: "Raohe", nameField: null, address: "Raohe St, Songshan District, Taipei City, Taiwan" }).language).toBe("zh-TW");
  });

  it("uses English for Singapore and unknown places, and never repeats an identical local name", () => {
    expect(driverCard({ name: "Maxwell Food Centre", nameField: null, address: "1 Kadayanallur St, Singapore 069184" }))
      .toMatchObject({ language: "en", request: { text: "Please take me to this address.", roman: null } });
    expect(driverCard({ name: "Somewhere", nameField: {}, address: "" }).language).toBe("en");
    expect(driverCard({ name: "Cafe Onion", nameField: { en: "Cafe Onion", ko: "Cafe Onion" }, address: "Seoul" }).localName).toBeNull();
  });
});
