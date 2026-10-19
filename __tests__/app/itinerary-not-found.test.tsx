import React from "react";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: "", host: "www.localley.io" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: state.host }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
import NotFound from "@/app/itineraries/[id]/not-found";
import { TripUnavailable, TripUnavailableView } from "@/components/itineraries/trip-unavailable";
const env = process.env;
beforeEach(() => { process.env = { ...env, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" }; state.host = "www.localley.io"; state.query = ""; });
afterEach(() => { process.env = env; });
it("renders neutral content with normal navigation on www despite the flag", async () => {
  state.query = "data_candidate=d1&title=PRIVATE_TITLE&redirect_url=https://foreign.test";
  render(await NotFound());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This trip is unavailable");
  expect(screen.getByRole("link", { name: "My trips" }).getAttribute("href")).toBe("/itineraries");
  expect(screen.getByRole("link", { name: "Explore places" }).getAttribute("href")).toBe("/spots");
  expect(document.body.textContent).not.toMatch(/PRIVATE_TITLE|foreign.test/);
});
it("preserves exact explicit preview opt-in on both recovery links", async () => {
  state.host = "localley-next-preview.nkopp.workers.dev"; state.query = "data_candidate=d1";
  render(await NotFound());
  expect(screen.getByRole("link", { name: "My trips" }).getAttribute("href")).toBe("/itineraries?data_candidate=d1");
  expect(screen.getByRole("link", { name: "Explore places" }).getAttribute("href")).toBe("/spots?data_candidate=d1");
});
it.each(["", "data_candidate=other", "data_candidate=d1&data_candidate=d1"])("refuses absent, foreign and duplicate opt-in: %s", query => {
  state.query = query; render(<TripUnavailable candidateHost />);
  expect(screen.getByRole("link", { name: "My trips" }).getAttribute("href")).toBe("/itineraries");
});
it.each(["AUTH_MAIL_MODE", "SUPABASE_READ_ONLY"])("keeps normal links if preview environment gate %s is off", async key => {
  state.host = "localley-next-preview.nkopp.workers.dev"; state.query = "data_candidate=d1"; process.env[key] = "off";
  render(await NotFound());
  expect(screen.getByRole("link", { name: "My trips" }).getAttribute("href")).toBe("/itineraries");
});
it("offers no source links or prefetch while search parameters are unresolved", () => {
  render(<TripUnavailableView pending />);
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(screen.getAllByRole("button").every(b => b.hasAttribute("disabled"))).toBe(true);
});
it("produces identical neutral markup without any private resource inputs", () => {
  const first = renderToStaticMarkup(<TripUnavailableView />);
  state.query = "id=private&title=PRIVATE_TITLE";
  expect(renderToStaticMarkup(<TripUnavailableView />)).toBe(first);
  expect(first).not.toContain("PRIVATE_TITLE");
});
