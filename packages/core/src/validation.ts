import type { CreateIntentInput, PaymentAsset, PaymentIntent } from "./types.js";
import { WpisError } from "./errors.js";

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isValidEvmAddress(value: string): boolean {
  return EVM_ADDRESS_PATTERN.test(value);
}

export function isPositiveIntegerString(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }
  return BigInt(value) > 0n;
}

function validateAsset(asset: PaymentAsset): void {
  if (!asset.symbol.trim()) {
    throw new WpisError("VALIDATION_ERROR", "asset.symbol is required");
  }
  if (asset.decimals < 0 || !Number.isInteger(asset.decimals)) {
    throw new WpisError("VALIDATION_ERROR", "asset.decimals must be a non-negative integer");
  }
  if (asset.type === "erc20") {
    if (!asset.contractAddress) {
      throw new WpisError("VALIDATION_ERROR", "asset.contractAddress is required for erc20 assets");
    }
    if (!isValidEvmAddress(asset.contractAddress)) {
      throw new WpisError("VALIDATION_ERROR", "asset.contractAddress must be a valid EVM address");
    }
  }
}

export function validateCreateIntentInput(input: CreateIntentInput): void {
  validateAsset(input.asset);

  if (!input.reference.trim()) {
    throw new WpisError("VALIDATION_ERROR", "reference is required");
  }
  if (!isValidEvmAddress(input.recipient)) {
    throw new WpisError("VALIDATION_ERROR", "recipient must be a valid EVM address");
  }
  if (!isPositiveIntegerString(input.amount)) {
    throw new WpisError("VALIDATION_ERROR", "amount must be a positive integer string in base units");
  }

  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new WpisError("VALIDATION_ERROR", "expiresAt must be a valid ISO datetime string");
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new WpisError("VALIDATION_ERROR", "expiresAt must be in the future");
  }

  if (input.confirmationPolicy && input.confirmationPolicy.minConfirmations < 0) {
    throw new WpisError("VALIDATION_ERROR", "confirmationPolicy.minConfirmations must be >= 0");
  }
}

export function validateIntent(intent: PaymentIntent): void {
  validateCreateIntentInput({
    chainId: intent.chainId,
    asset: intent.asset,
    recipient: intent.recipient,
    amount: intent.amount,
    reference: intent.reference,
    expiresAt: intent.expiresAt,
    confirmationPolicy: intent.confirmationPolicy
  });
}
