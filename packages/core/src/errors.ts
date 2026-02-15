export type WpisErrorCode =
  | "VALIDATION_ERROR"
  | "RPC_ERROR"
  | "EXPIRED_ERROR"
  | "CONFIRMATION_PENDING"
  | "CHAIN_MISMATCH";

export class WpisError extends Error {
  public readonly code: WpisErrorCode;

  public constructor(code: WpisErrorCode, message: string) {
    super(message);
    this.name = "WpisError";
    this.code = code;
  }
}

export function isWpisError(value: unknown): value is WpisError {
  return value instanceof WpisError;
}
