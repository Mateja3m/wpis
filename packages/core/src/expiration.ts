import type { PaymentIntent } from "./types.js";

export function isExpired(expiresAtIso: string, now: Date = new Date()): boolean {
  return new Date(expiresAtIso).getTime() <= now.getTime();
}

export function isIntentExpired(intent: PaymentIntent, now: Date = new Date()): boolean {
  return isExpired(intent.expiresAt, now);
}
