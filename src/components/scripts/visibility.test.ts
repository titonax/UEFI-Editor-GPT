import { describe, expect, it } from "vitest";
import { condition, firmwareData, prompt } from "../../test/fixtures";
import { childVisibility, combineVisibility } from "./visibility";

describe("visibility semantics", () => {
  it("does not treat AccessLevel as proof that an item is hidden", () => {
    const child = prompt({ accessLevel: "05" });
    expect(childVisibility(firmwareData(), child).status).toBe("visible");
  });

  it("classifies SuppressIf separately from GrayOutIf", () => {
    const child = prompt({ conditions: ["0x10"] });
    const hidden = firmwareData({
      suppressions: [condition({ offset: "0x10", constant: true })],
    });
    const unavailable = firmwareData({
      suppressions: [condition({ offset: "0x10", kind: "DisableIf" })],
    });

    expect(childVisibility(hidden, child)).toMatchObject({
      status: "hidden",
      gate: "suppression",
    });
    expect(childVisibility(unavailable, child)).toMatchObject({
      status: "conditional",
      gate: "availability",
    });
  });

  it("propagates the strongest parent gate", () => {
    expect(combineVisibility("hidden", "visible")).toBe("hidden");
    expect(combineVisibility("conditional", "visible")).toBe("conditional");
    expect(combineVisibility("visible", "conditional")).toBe("conditional");
  });
});
