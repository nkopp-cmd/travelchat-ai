import { describe, expect, it } from "vitest";
import { addressDisplayGeography } from "@/lib/spots/display-geography";

describe("card geography from source addresses", () => {
  it("shows a named city and only an area actually named in its address", () => {
    expect(addressDisplayGeography("Hongdae, Seoul, South Korea")).toEqual({cityName:"Seoul",citySlug:"seoul",areaName:"Hongdae"});
  });
  it("does not map a country to its capital", () => {
    expect(addressDisplayGeography("South Korea")).toEqual({});
    expect(addressDisplayGeography("Busan, South Korea").cityName).toBe("Busan");
  });
  it("does not match part of another word or hide conflicting city names", () => {
    expect(addressDisplayGeography("Narashino, Japan")).toEqual({});
    expect(addressDisplayGeography("Seoul to Busan")).toEqual({});
  });
  it("omits an unknown area instead of showing a street as a neighborhood", () => {
    expect(addressDisplayGeography("123 Unknown Road, Tokyo, Japan")).toEqual({cityName:"Tokyo",citySlug:"tokyo",areaName:undefined});
  });
});
