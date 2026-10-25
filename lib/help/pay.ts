import pay from "./pay.json";

/** "How can I pay here?" (helper 4, shared/plans/localley-helper-community.md): reviewed, sourced facts per country. */
export const PAY_CHECKED_AT = pay.checkedAt;

export const PAY_SECTIONS = [
  { id: "cards", title: "Cards" },
  { id: "cash", title: "Cash" },
  { id: "qr_wallets", title: "Phone and QR wallets" },
  { id: "transit", title: "Transit card" },
  { id: "atm", title: "ATMs" },
] as const;

export type PayGuide = Record<(typeof PAY_SECTIONS)[number]["id"], string[]> & { tipping: string; sources: string[] };

export function payGuide(slug: string): PayGuide | undefined {
  return (pay.countries as Record<string, PayGuide>)[slug];
}
