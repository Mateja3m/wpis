import { describe, expect, it } from "vitest";
import {
  canTransition,
  isExpired,
  transitionStatus,
  validateCreateIntentInput
} from "../src/index.js";

describe("validateCreateIntentInput", () => {
  it("accepts a valid native asset input", () => {
    expect(() =>
      validateCreateIntentInput({
        asset: { symbol: "ETH", decimals: 18, type: "native" },
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "1000000000000000",
        reference: "order-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).not.toThrow();
  });

  it("fails invalid recipient", () => {
    expect(() =>
      validateCreateIntentInput({
        asset: { symbol: "ETH", decimals: 18, type: "native" },
        recipient: "bad-address",
        amount: "1",
        reference: "order-2",
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
    ).toThrow(/recipient/);
  });
});

describe("expiration", () => {
  it("detects expired timestamps", () => {
    expect(isExpired(new Date(Date.now() - 1000).toISOString(), new Date())).toBe(true);
    expect(isExpired(new Date(Date.now() + 1000).toISOString(), new Date())).toBe(false);
  });
});

describe("state transitions", () => {
  it("allows pending -> detected", () => {
    expect(canTransition("PENDING", "DETECTED")).toBe(true);
    expect(transitionStatus("PENDING", "DETECTED")).toBe("DETECTED");
  });

  it("rejects confirmed -> pending", () => {
    expect(canTransition("CONFIRMED", "PENDING")).toBe(false);
    expect(() => transitionStatus("CONFIRMED", "PENDING")).toThrow(/invalid status transition/);
  });
});
