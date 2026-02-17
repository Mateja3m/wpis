import { randomUUID } from "node:crypto";
import {
  WpisError,
  isIntentExpired,
  validateCreateIntentInput,
  type ChainAdapter,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentRequest,
  type VerificationResult
} from "@idoa/wpis-core";
import { createPublicClient, getAddress, http, pad, parseAbiItem, toEventSelector, type Address, type Hash } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";

const DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
const DEFAULT_ARBITRUM_SEPOLIA_CAIP2 = `eip155:${DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID}`;
const DEFAULT_MIN_CONFIRMATIONS = 2;
const DEFAULT_SCAN_BLOCKS = 500n;
const ERC20_LOG_CHUNK_SIZE = 500n;

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const transferTopic0 = toEventSelector(transferEvent);

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
  getChainId(): Promise<number>;
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
  expectedChainId?: number;
  now?: () => Date;
  isReferenceUsed?: (reference: string) => boolean;
  markReferenceUsed?: (reference: string) => void;
  client?: EvmClient;
}

function normalizeAddress(address: string): Address {
  return getAddress(address);
}

function toBigInt(amount: string): bigint {
  return BigInt(amount);
}

function isDebugEnabled(): boolean {
  return process.env.DEBUG_WPIS === "1";
}

function isVerboseEnabled(): boolean {
  return process.env.DEBUG_WPIS_VERBOSE === "1";
}

function shouldDumpFilters(): boolean {
  return process.env.DEBUG_WPIS_DUMP_FILTERS === "1";
}

function debugLog(message: string, payload?: Record<string, unknown>): void {
  if (!isDebugEnabled()) {
    return;
  }
  if (payload) {
    console.info(`[wpis:adapter-arbitrum] ${message}`, payload);
    return;
  }
  console.info(`[wpis:adapter-arbitrum] ${message}`);
}

function toRpcHost(rpcUrl: string | undefined): string {
  if (!rpcUrl) {
    return "unknown";
  }
  try {
    return new URL(rpcUrl).hostname;
  } catch {
    return "invalid-url";
  }
}

export function computeScanRange(currentBlock: bigint, scanBlocks: bigint): { fromBlock: bigint; toBlock: bigint } {
  const fromBlock = currentBlock > scanBlocks ? currentBlock - scanBlocks : 0n;
  return { fromBlock, toBlock: currentBlock };
}

export function buildErc20TransferLogQuery(
  contractAddress: Address,
  recipient: Address,
  fromBlock: bigint,
  toBlock: bigint
): {
  address: Address;
  event: typeof transferEvent;
  args: { to: Address };
  fromBlock: bigint;
  toBlock: bigint;
} {
  return {
    address: contractAddress,
    event: transferEvent,
    args: { to: recipient },
    fromBlock,
    toBlock
  };
}

function resolveChain(expectedChainId: number): typeof arbitrum | typeof arbitrumSepolia {
  if (expectedChainId === 42161) {
    return arbitrum;
  }
  if (expectedChainId === 421614) {
    return arbitrumSepolia;
  }
  throw new WpisError("VALIDATION_ERROR", `unsupported arbitrum chain id: ${expectedChainId}`);
}

function createDefaultClient(rpcUrl: string | undefined, expectedChainId: number): EvmClient {
  const resolvedUrl = rpcUrl ?? process.env.EVM_RPC_URL;
  if (!resolvedUrl) {
    throw new WpisError("RPC_ERROR", "EVM_RPC_URL is required for verification");
  }

  const chain = resolveChain(expectedChainId);
  const client = createPublicClient({
    chain,
    transport: http(resolvedUrl)
  });

  return {
    getChainId: () => client.getChainId(),
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
  private readonly expectedChainId: number;
  private readonly expectedCaip2: string;
  private readonly now: () => Date;
  private readonly isReferenceUsed: (reference: string) => boolean;
  private readonly markReferenceUsed: (reference: string) => void;
  private readonly client: EvmClient;
  private readonly rpcHost: string;

  public constructor(options: ArbitrumAdapterOptions = {}) {
    this.scanBlocks = options.scanBlocks ?? DEFAULT_SCAN_BLOCKS;
    this.expectedChainId = options.expectedChainId ?? DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID;
    this.expectedCaip2 = `eip155:${this.expectedChainId}`;
    this.now = options.now ?? (() => new Date());

    const seenReferences = new Set<string>();
    this.isReferenceUsed = options.isReferenceUsed ?? ((reference: string) => seenReferences.has(reference));
    this.markReferenceUsed =
      options.markReferenceUsed ??
      ((reference: string) => {
        seenReferences.add(reference);
      });

    this.client = options.client ?? createDefaultClient(options.rpcUrl, this.expectedChainId);
    this.rpcHost = toRpcHost(options.rpcUrl ?? process.env.EVM_RPC_URL);
  }

  public createIntent(input: CreateIntentInput): PaymentIntent {
    validateCreateIntentInput(input);

    const chainId = input.chainId ?? this.expectedCaip2;
    if (chainId !== this.expectedCaip2) {
      throw new WpisError("CHAIN_MISMATCH", `chainId must be ${this.expectedCaip2}`);
    }

    if (this.isReferenceUsed(input.reference)) {
      throw new WpisError("VALIDATION_ERROR", "reference must be unique");
    }

    const createdAt = this.now();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt.getTime() <= createdAt.getTime()) {
      throw new WpisError("VALIDATION_ERROR", "expiresAt must be greater than current time");
    }

    this.markReferenceUsed(input.reference);

    return {
      id: randomUUID(),
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      chainId,
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
        ? `ethereum:${intent.recipient}@${this.expectedChainId}?value=${intent.amount}`
        : `ethereum:${intent.asset.contractAddress}@${this.expectedChainId}/transfer?address=${intent.recipient}&uint256=${intent.amount}`;

    const instructions = [
      "Developer PoC mapping strategy: recipient + amount + scan window.",
      "Send exact or greater base-unit amount to the intent recipient.",
      `Reference (off-chain): ${intent.reference}`,
      `Intent expires at ${intent.expiresAt}.`
    ];

    return {
      paymentLink,
      qrPayload: paymentLink,
      instructions,
      expiresAt: intent.expiresAt
    };
  }

  public async getRpcHealth(): Promise<{ rpcConnected: boolean; chainId: number | null }> {
    try {
      const chainId = await this.client.getChainId();
      return { rpcConnected: true, chainId };
    } catch {
      return { rpcConnected: false, chainId: null };
    }
  }

  public async verify(intent: PaymentIntent): Promise<VerificationResult> {
    if (intent.chainId !== this.expectedCaip2) {
      return {
        status: "FAILED",
        reason: `intent chain mismatch: expected ${this.expectedCaip2}`,
        errorCode: "CHAIN_MISMATCH"
      };
    }

    if (isIntentExpired(intent, this.now())) {
      return {
        status: "EXPIRED",
        reason: "intent expired",
        errorCode: "EXPIRED_ERROR"
      };
    }

    try {
      const rpcChainId = await this.client.getChainId();
      if (rpcChainId !== DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID) {
        return {
          status: "FAILED",
          reason: `rpc chain mismatch: expected ${DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID}, got ${rpcChainId}`,
          errorCode: "CHAIN_MISMATCH"
        };
      }

      const latestBlock = await this.client.getBlockNumber();
      const scanRange = computeScanRange(latestBlock, this.scanBlocks);
      debugLog("verify.begin", {
        path: intent.asset.type,
        rpcHost: this.rpcHost,
        rpcChainId,
        expectedChainId: DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID,
        latestBlock: latestBlock.toString(),
        fromBlock: scanRange.fromBlock.toString(),
        toBlock: scanRange.toBlock.toString()
      });
      debugLog("verify.criteria", {
        recipient: normalizeAddress(intent.recipient),
        contractAddress: intent.asset.contractAddress ? normalizeAddress(intent.asset.contractAddress) : null,
        amountBaseUnits: intent.amount,
        amountComparison: ">=",
        minConfirmations: intent.confirmationPolicy.minConfirmations
      });

      return intent.asset.type === "native"
        ? this.verifyNative(intent, latestBlock, scanRange.fromBlock)
        : this.verifyErc20(intent, latestBlock, scanRange.fromBlock);
    } catch (error) {
      const message = error instanceof Error ? error.message : "rpc verification failed";
      return {
        status: "FAILED",
        reason: message,
        errorCode: "RPC_ERROR"
      };
    }
  }

  private async verifyNative(intent: PaymentIntent, currentBlock: bigint, fromBlock: bigint): Promise<VerificationResult> {
    const recipient = normalizeAddress(intent.recipient);
    const minimumAmount = toBigInt(intent.amount);

    let detected: { hash: Hash; confirmations: number } | null = null;
    let blocksIterated = 0;
    let transactionsExamined = 0;
    let recipientCandidates = 0;
    const verboseCandidates: Array<{ txHash: Hash; value: string; blockNumber: string }> = [];

    for (let blockNumber = currentBlock; blockNumber >= fromBlock; blockNumber -= 1n) {
      blocksIterated += 1;
      const block = await this.client.getBlock({ blockNumber, includeTransactions: true });
      transactionsExamined += block.transactions.length;
      const tx = block.transactions.find((candidate) => {
        if (!candidate.to || candidate.blockNumber === null) {
          return false;
        }
        const isRecipientMatch = normalizeAddress(candidate.to) === recipient;
        if (isRecipientMatch) {
          recipientCandidates += 1;
          if (isDebugEnabled() && recipientCandidates <= 10) {
            debugLog("verify.native.candidate", {
              txHash: candidate.hash,
              txValueBaseUnits: candidate.value.toString(),
              intentAmountBaseUnits: minimumAmount.toString(),
              comparison: "candidate.value >= intent.amount"
            });
          }
          if (isVerboseEnabled() && verboseCandidates.length < 10) {
            verboseCandidates.push({
              txHash: candidate.hash,
              value: candidate.value.toString(),
              blockNumber: candidate.blockNumber.toString()
            });
          }
        }
        return isRecipientMatch && candidate.value >= minimumAmount;
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

    debugLog("verify.native.scan_summary", {
      blocksIterated,
      transactionsExamined,
      recipientCandidates,
      verboseCandidates: isVerboseEnabled() ? verboseCandidates : undefined
    });

    if (!detected) {
      return { status: "PENDING", reason: "matching transaction not found in scan range" };
    }

    if (detected.confirmations >= intent.confirmationPolicy.minConfirmations) {
      return { status: "CONFIRMED", txHash: detected.hash, confirmations: detected.confirmations };
    }

    return {
      status: "DETECTED",
      txHash: detected.hash,
      confirmations: detected.confirmations,
      reason: "confirmation policy not yet met",
      errorCode: "CONFIRMATION_PENDING"
    };
  }

  private async verifyErc20(intent: PaymentIntent, currentBlock: bigint, fromBlock: bigint): Promise<VerificationResult> {
    if (!intent.asset.contractAddress) {
      return {
        status: "FAILED",
        reason: "missing erc20 contract address",
        errorCode: "VALIDATION_ERROR"
      };
    }

    const recipient = normalizeAddress(intent.recipient);
    const minimumAmount = toBigInt(intent.amount);
    const contractAddress = normalizeAddress(intent.asset.contractAddress);
    const topic2To = pad(recipient);
    const query = buildErc20TransferLogQuery(contractAddress, recipient, fromBlock, currentBlock);

    debugLog("verify.erc20.filter", {
      transferTopic0,
      topic2To,
      fromBlock: fromBlock.toString(),
      toBlock: currentBlock.toString()
    });
    if (shouldDumpFilters()) {
      debugLog("verify.erc20.filter.dump", {
        address: query.address,
        args: query.args,
        fromBlock: query.fromBlock.toString(),
        toBlock: query.toBlock.toString()
      });
    }

    let logs: Erc20TransferLog[];
    try {
      logs = await this.client.getLogs(query);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown getLogs error";
      const lowerMessage = message.toLowerCase();
      const isRangeLimit =
        lowerMessage.includes("query returned more than") ||
        lowerMessage.includes("block range") ||
        lowerMessage.includes("response size exceeded") ||
        lowerMessage.includes("limit exceeded");

      if (isRangeLimit && isDebugEnabled()) {
        let chunkFrom = fromBlock;
        while (chunkFrom <= currentBlock) {
          const chunkTo = chunkFrom + ERC20_LOG_CHUNK_SIZE <= currentBlock ? chunkFrom + ERC20_LOG_CHUNK_SIZE : currentBlock;
          try {
            const chunkLogs = await this.client.getLogs(buildErc20TransferLogQuery(contractAddress, recipient, chunkFrom, chunkTo));
            debugLog("verify.erc20.chunk_logs", {
              chunkFrom: chunkFrom.toString(),
              chunkTo: chunkTo.toString(),
              count: chunkLogs.length
            });
          } catch (chunkError) {
            debugLog("verify.erc20.chunk_logs_error", {
              chunkFrom: chunkFrom.toString(),
              chunkTo: chunkTo.toString(),
              message: chunkError instanceof Error ? chunkError.message : String(chunkError)
            });
          }

          if (chunkTo === currentBlock) {
            break;
          }
          chunkFrom = chunkTo + 1n;
        }
      }

      if (isRangeLimit) {
        return {
          status: "FAILED",
          reason: "rpc eth_getLogs range limit encountered; reduce EVM_SCAN_BLOCKS or use DEBUG_WPIS chunk diagnostics",
          errorCode: "RPC_ERROR"
        };
      }

      throw error;
    }
    debugLog("verify.erc20.logs", { count: logs.length });

    if (logs.length === 0 && isDebugEnabled()) {
      let chunkFrom = fromBlock;
      while (chunkFrom <= currentBlock) {
        const chunkTo = chunkFrom + ERC20_LOG_CHUNK_SIZE <= currentBlock ? chunkFrom + ERC20_LOG_CHUNK_SIZE : currentBlock;
        const chunkLogs = await this.client.getLogs(buildErc20TransferLogQuery(contractAddress, recipient, chunkFrom, chunkTo));
        debugLog("verify.erc20.chunk_logs", {
          chunkFrom: chunkFrom.toString(),
          chunkTo: chunkTo.toString(),
          count: chunkLogs.length
        });
        if (chunkTo === currentBlock) {
          break;
        }
        chunkFrom = chunkTo + 1n;
      }
    }

    const match = logs.find((entry) => {
      const value = entry.args.value;
      const logRecipient = entry.args.to ? normalizeAddress(entry.args.to) : null;
      return entry.blockNumber !== null && value !== undefined && logRecipient === recipient && value >= minimumAmount;
    });

    if (!match || match.blockNumber === null || match.transactionHash === null) {
      return { status: "PENDING", reason: "matching transfer not found in scan range" };
    }

    const confirmations = Number(currentBlock - match.blockNumber + 1n);
    if (confirmations >= intent.confirmationPolicy.minConfirmations) {
      return { status: "CONFIRMED", txHash: match.transactionHash, confirmations };
    }

    return {
      status: "DETECTED",
      txHash: match.transactionHash,
      confirmations,
      reason: "confirmation policy not yet met",
      errorCode: "CONFIRMATION_PENDING"
    };
  }
}

export function createArbitrumAdapter(options?: ArbitrumAdapterOptions): ArbitrumAdapter {
  return new ArbitrumAdapter(options);
}

export const ARBITRUM_SEPOLIA_CAIP2 = DEFAULT_ARBITRUM_SEPOLIA_CAIP2;
export const ARBITRUM_SEPOLIA_CHAIN = DEFAULT_ARBITRUM_SEPOLIA_CHAIN_ID;
