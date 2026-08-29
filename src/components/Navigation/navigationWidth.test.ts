import { describe, expect, it } from "vitest";
import {
  clampNavigationWidth,
  defaultNavigationWidth,
  maxNavigationWidth,
  storedNavigationWidth,
} from "./navigationWidth";

describe("navigation width", () => {
  it("keeps the original responsive defaults", () => {
    expect(defaultNavigationWidth(500)).toBe(220);
    expect(defaultNavigationWidth(800)).toBe(280);
    expect(defaultNavigationWidth(1400)).toBe(360);
  });

  it("reserves room for content and caps very wide trees", () => {
    expect(maxNavigationWidth(1000)).toBe(640);
    expect(maxNavigationWidth(4000)).toBe(1200);
    expect(clampNavigationWidth(900, 1000)).toBe(640);
    expect(clampNavigationWidth(100, 1000)).toBe(200);
  });

  it("accepts a stored width and rejects invalid values", () => {
    expect(storedNavigationWidth("520", 1200)).toBe(520);
    expect(storedNavigationWidth("invalid", 1200)).toBe(360);
    expect(storedNavigationWidth(null, 800)).toBe(280);
  });
});
