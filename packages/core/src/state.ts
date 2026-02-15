import type { PaymentStatus } from "./types.js";

const allowedTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["DETECTED", "CONFIRMED", "EXPIRED", "FAILED"],
  DETECTED: ["CONFIRMED", "EXPIRED", "FAILED"],
  CONFIRMED: [],
  EXPIRED: [],
  FAILED: []
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionStatus(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  if (!canTransition(from, to)) {
    throw new Error(`invalid status transition: ${from} -> ${to}`);
  }
  return to;
}
