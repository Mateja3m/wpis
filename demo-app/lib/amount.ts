import { parseUnits } from "viem";

export function toBaseUnits(humanAmount: string, decimals: number): string {
  const normalized = humanAmount.trim();
  if (!normalized) {
    throw new Error("amount is required");
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("decimals must be a non-negative integer");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("amount must be a positive decimal number");
  }

  const [_, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > decimals) {
    throw new Error("too many decimal places for asset decimals");
  }

  return parseUnits(normalized, decimals).toString();
}
