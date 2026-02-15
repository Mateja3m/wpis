export type PaymentStatus = "PENDING" | "DETECTED" | "CONFIRMED" | "EXPIRED" | "FAILED";

export type AssetType = "native" | "erc20";

export interface PaymentAsset {
  symbol: string;
  decimals: number;
  type: AssetType;
  contractAddress?: string;
}

export interface ConfirmationPolicy {
  minConfirmations: number;
}

export interface PaymentIntent {
  id: string;
  createdAt: string;
  expiresAt: string;
  chainId: string;
  asset: PaymentAsset;
  recipient: string;
  amount: string;
  reference: string;
  confirmationPolicy: ConfirmationPolicy;
  status: PaymentStatus;
}

export interface CreateIntentInput {
  chainId?: string;
  asset: PaymentAsset;
  recipient: string;
  amount: string;
  reference: string;
  expiresAt: string;
  confirmationPolicy?: ConfirmationPolicy;
}

export interface PaymentRequest {
  paymentLink: string;
  qrPayload: string;
  instructions: string[];
  expiresAt: string;
}

export interface VerificationResult {
  status: PaymentStatus;
  txHash?: string;
  confirmations?: number;
  reason?: string;
  errorCode?: import("./errors.js").WpisErrorCode;
}

export interface ChainAdapter {
  createIntent(input: CreateIntentInput): PaymentIntent;
  buildRequest(intent: PaymentIntent): PaymentRequest;
  verify(intent: PaymentIntent): Promise<VerificationResult>;
}
