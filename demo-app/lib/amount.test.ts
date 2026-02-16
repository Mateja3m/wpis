import { describe, expect, it } from "vitest";
import { toBaseUnits } from "./amount.js";

describe("toBaseUnits", () => {
  it("converts decimal amounts into base units", () => {
    expect(toBaseUnits("1.5", 18)).toBe("1500000000000000000");
    expect(toBaseUnits("0.0001", 18)).toBe("100000000000000");
    expect(toBaseUnits("12", 6)).toBe("12000000");
  });

  it("rejects invalid precision and non-numeric inputs", () => {
    expect(() => toBaseUnits("1.1234567", 6)).toThrow(/decimal places/);
    expect(() => toBaseUnits("abc", 18)).toThrow(/positive decimal/);
  });
});
