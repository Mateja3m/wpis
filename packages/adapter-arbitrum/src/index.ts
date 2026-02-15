import { randomUUID } from "node:crypto";
import {
  isIntentExpired,
  validateCreateIntentInput,
  type ChainAdapter,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentRequest,
  type VerificationResult
} from "@wpis/core";
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hash
} from "viem";
import { optimism } from "viem/chains";

const DEFAULT_CHAIN_ID = "eip155:42161";
const DEFAULT_MIN_CONFIRMATIONS = 2;
const DEFAULT_SCAN_BLOCKS = 500n;

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export interface EvmTransaction {
  hash: Hash;
  to: Address | null;
  value: bigint;
  blockNumber: bigint | null;
}

export interface EvmBlock {
  transactions: EvmTransaction[];
}

export interface Erc20TransferLog {
  transactionHash: Hash | null;
  blockNumber: bigint | null;
  args: {
    to?: Address;
    value?: bigint;
  };
}

export interface EvmClient {
  getBlockNumber(): Promise<bigint>;
  getBlock(args: { blockNumber: bigint; includeTransactions: true }): Promise<EvmBlock>;
  getLogs(args: {
    address: Address;
    event: typeof transferEvent;
    args: { to: Address };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<Erc20TransferLog[]>;
}

export interface ArbitrumAdapterOptions {
  rpcUrl?: string;
  scanBlocks?: bigint;
  now?: () => Date;
  isReferenceUsed?: (reference: string) => boolean;
  markReferenceUsed?: (reference: string) => void;
  client?: EvmClient;
}

function normalizeAddress(address: string): Address {
  return address.toLowerCase() as Address;
}

function toBigInt(amount: string): bigint {
  return BigInt(amount);
}

function createDefaultClient(rpcUrl?: string): EvmClient {
  const resolvedUrl = rpcUrl ?? process.env.EVM_RPC_URL;
  if (!resolvedUrl) {
    throw new Error("EVM_RPC_URL is required for verification");
  }

  const client = createPublicClient({
    chain: optimism,
    transport: http(resolvedUrl)
  });

  return {
    getBlockNumber: () => client.getBlockNumber(),
    getBlock: async (args) => {
      const block = await client.getBlock(args);
      const transactions = block.transactions
        .filter((transaction): transaction is Exclude<(typeof block.transactions)[number], Hash> => typeof transaction !== "string")
        .map(
          (transaction): EvmTransaction => ({
            hash: transaction.hash,
            to: transaction.to,
            value: transaction.value,
            blockNumber: transaction.blockNumber
          })
        );

      return { transactions };
    },
    getLogs: async (args) => {
      const logs = await client.getLogs(args);
      return logs.map(
        (log): Erc20TransferLog => {
          const normalizedArgs: { to?: Address; value?: bigint } = {};
          if (log.args.to !== undefined) {
            normalizedArgs.to = log.args.to;
          }
          if (log.args.value !== undefined) {
            normalizedArgs.value = log.args.value;
          }
          return {
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            args: normalizedArgs
          };
        }
      );
    }
  };
}

export class ArbitrumAdapter implements ChainAdapter {
  private readonly scanBlocks: bigint;
  private readonly now: () => Date;
  private readonly isReferenceUsed: (reference: string) => boolean;
  private readonly markReferenceUsed: (reference: string) => void;
  private readonly client: EvmClient;

  public constructor(options: ArbitrumAdapterOptions = {}) {
    this.scanBlocks = options.scanBlocks ?? DEFAULT_SCAN_BLOCKS;
    this.now = options.now ?? (() => new Date());

    const seenReferences = new Set<string>();
    this.isReferenceUsed = options.isReferenceUsed ?? ((reference: string) => seenReferences.has(reference));
    this.markReferenceUsed =
      options.markReferenceUsed ??
      ((reference: string) => {
        seenReferences.add(reference);
      });

    this.client = options.client ?? createDefaultClient(options.rpcUrl);
  }

  public createIntent(input: CreateIntentInput): PaymentIntent {
    validateCreateIntentInput(input);

    if (this.isReferenceUsed(input.reference)) {
      throw new Error("reference must be unique");
    }

    const createdAt = this.now();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt.getTime() <= createdAt.getTime()) {
      throw new Error("expiresAt must be greater than current time");
    }

    this.markReferenceUsed(input.reference);

    return {
      id: randomUUID(),
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      chainId: input.chainId ?? DEFAULT_CHAIN_ID,
      asset: input.asset,
      recipient: input.recipient,
      amount: input.amount,
      reference: input.reference,
      confirmationPolicy: {
        minConfirmations: input.confirmationPolicy?.minConfirmations ?? DEFAULT_MIN_CONFIRMATIONS
      },
      status: "PENDING"
    };
  }

  public buildRequest(intent: PaymentIntent): PaymentRequest {
    const paymentLink =
      intent.asset.type === "native"
        ? `ethereum:${intent.recipient}?value=${intent.amount}`
        : `ethereum:${intent.asset.contractAddress}/transfer?address=${intent.recipient}&uint256=${intent.amount}`;

    const instructions = [
      `Send ${intent.amount} base units of ${intent.asset.symbol} to ${intent.recipient}.`,
      `Use reference: ${intent.reference}.`,
      `Payment expires at ${intent.expiresAt}.`
    ];

    return {
      paymentLink,
      qrPayload: paymentLink,
      instructions,
      expiresAt: intent.expiresAt
    };
  }

  public async verify(intent: PaymentIntent): Promise<VerificationResult> {
    if (isIntentExpired(intent, this.now())) {
      return { status: "EXPIRED", reason: "intent expired" };
    }

    return intent.asset.type === "native" ? this.verifyNative(intent) : this.verifyErc20(intent);
  }

  private async verifyNative(intent: PaymentIntent): Promise<VerificationResult> {
    const currentBlock = await this.client.getBlockNumber();
    const fromBlock = currentBlock > this.scanBlocks ? currentBlock - this.scanBlocks : 0n;
    const recipient = normalizeAddress(intent.recipient);
    const minimumAmount = toBigInt(intent.amount);

    let detected: { hash: Hash; confirmations: number } | null = null;

    for (let blockNumber = currentBlock; blockNumber >= fromBlock; blockNumber -= 1n) {
      const block = await this.client.getBlock({ blockNumber, includeTransactions: true });
      const tx = block.transactions.find((candidate) => {
        if (!candidate.to || candidate.blockNumber === null) {
          return false;
        }
        return normalizeAddress(candidate.to) === recipient && candidate.value >= minimumAmount;
      });

      if (tx && tx.blockNumber !== null) {
        const confirmations = Number(currentBlock - tx.blockNumber + 1n);
        detected = { hash: tx.hash, confirmations };
        break;
      }

      if (blockNumber === 0n) {
        break;
      }
    }

    if (!detected) {
      return { status: "PENDING", reason: "matching transaction not found in scan range" };
    }

    if (detected.confirmations >= intent.confirmationPolicy.minConfirmations) {
      return { status: "CONFIRMED", txHash: detected.hash, confirmations: detected.confirmations };
    }

    return { status: "DETECTED", txHash: detected.hash, confirmations: detected.confirmations };
  }

  private async verifyErc20(intent: PaymentIntent): Promise<VerificationResult> {
    if (!intent.asset.contractAddress) {
      return { status: "FAILED", reason: "missing erc20 contract address" };
    }

    const currentBlock = await this.client.getBlockNumber();
    const fromBlock = currentBlock > this.scanBlocks ? currentBlock - this.scanBlocks : 0n;
    const recipient = normalizeAddress(intent.recipient);
    const minimumAmount = toBigInt(intent.amount);

    const logs = await this.client.getLogs({
      address: normalizeAddress(intent.asset.contractAddress),
      event: transferEvent,
      args: { to: recipient },
      fromBlock,
      toBlock: currentBlock
    });

    const match = logs.find((entry) => {
      const value = entry.args.value;
      return entry.blockNumber !== null && value !== undefined && value >= minimumAmount;
    });

    if (!match || match.blockNumber === null || match.transactionHash === null) {
      return { status: "PENDING", reason: "matching transfer not found in scan range" };
    }

    const confirmations = Number(currentBlock - match.blockNumber + 1n);

    if (confirmations >= intent.confirmationPolicy.minConfirmations) {
      return { status: "CONFIRMED", txHash: match.transactionHash, confirmations };
    }

    return { status: "DETECTED", txHash: match.transactionHash, confirmations };
  }
}

export function createArbitrumAdapter(options?: ArbitrumAdapterOptions): ArbitrumAdapter {
  return new ArbitrumAdapter(options);
}
