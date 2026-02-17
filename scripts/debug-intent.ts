import { readFile } from "node:fs/promises";
import { createPublicClient, http, pad, parseAbiItem, toEventSelector, type Address, type Hash } from "viem";
import type { PaymentIntent } from "@idoa/wpis-core";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const transferTopic0 = toEventSelector(transferEvent);

interface Args {
  intentId?: string;
  intentFile?: string;
  verifierUrl: string;
}

interface VerifierIntentResponse {
  intent: PaymentIntent;
  status: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    verifierUrl: "http://localhost:4000"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) {
      continue;
    }

    if (arg === "--intent-id") {
      args.intentId = value;
      index += 1;
    } else if (arg === "--intent-file") {
      args.intentFile = value;
      index += 1;
    } else if (arg === "--verifier-url") {
      args.verifierUrl = value;
      index += 1;
    }
  }
  return args;
}

function toChainId(caip2: string): number | null {
  const [, chainId] = caip2.split(":");
  const parsed = Number(chainId);
  return Number.isInteger(parsed) ? parsed : null;
}

function computeScanRange(latestBlock: bigint, scanBlocks: bigint): { fromBlock: bigint; toBlock: bigint } {
  const fromBlock = latestBlock > scanBlocks ? latestBlock - scanBlocks : 0n;
  return { fromBlock, toBlock: latestBlock };
}

async function loadIntentFromFile(path: string): Promise<PaymentIntent> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as PaymentIntent | VerifierIntentResponse;
  if ("intent" in parsed) {
    return parsed.intent;
  }
  return parsed;
}

async function loadIntentFromApi(verifierUrl: string, intentId: string): Promise<PaymentIntent> {
  const response = await fetch(`${verifierUrl}/intents/${intentId}`);
  if (!response.ok) {
    throw new Error(`failed to fetch intent ${intentId}: HTTP ${response.status}`);
  }
  const parsed = (await response.json()) as VerifierIntentResponse;
  return parsed.intent;
}

function printIntent(intent: PaymentIntent): void {
  console.info("Intent:");
  console.info(`  id: ${intent.id}`);
  console.info(`  recipient: ${intent.recipient}`);
  console.info(`  asset.type: ${intent.asset.type}`);
  console.info(`  asset.symbol: ${intent.asset.symbol}`);
  console.info(`  asset.contractAddress: ${intent.asset.contractAddress ?? "N/A"}`);
  console.info(`  amount(base units): ${intent.amount}`);
  console.info(`  expiresAt: ${intent.expiresAt}`);
  console.info(`  chainId: ${intent.chainId}`);
  console.info(`  minConfirmations: ${intent.confirmationPolicy.minConfirmations}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.intentId && !args.intentFile) {
    console.error("Configuration error: pass --intent-id <id> or --intent-file <path>");
    return 2;
  }

  const rpcUrl = process.env.EVM_RPC_URL;
  if (!rpcUrl) {
    console.error("Configuration error: EVM_RPC_URL is required");
    return 2;
  }

  let intent: PaymentIntent;
  try {
    intent = args.intentFile ? await loadIntentFromFile(args.intentFile) : await loadIntentFromApi(args.verifierUrl, args.intentId as string);
  } catch (error) {
    console.error("Configuration error:", error instanceof Error ? error.message : String(error));
    return 2;
  }

  printIntent(intent);

  const expectedChainId = toChainId(intent.chainId);
  if (expectedChainId === null) {
    console.error(`Configuration error: invalid intent.chainId ${intent.chainId}`);
    return 2;
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  let rpcChainId: number;
  let latestBlock: bigint;
  try {
    rpcChainId = await client.getChainId();
    latestBlock = await client.getBlockNumber();
  } catch (error) {
    console.error("Configuration error: RPC unreachable", error instanceof Error ? error.message : String(error));
    return 2;
  }

  console.info(`RPC chainId: ${rpcChainId}`);
  if (rpcChainId !== expectedChainId) {
    console.error(`Configuration error: chain mismatch (intent ${expectedChainId} vs rpc ${rpcChainId})`);
    return 2;
  }

  const scanBlocks = /^\d+$/.test(process.env.EVM_SCAN_BLOCKS ?? "") ? BigInt(process.env.EVM_SCAN_BLOCKS as string) : 150n;
  const range = computeScanRange(latestBlock, scanBlocks);
  console.info(`Latest block: ${latestBlock}`);
  console.info(`Scan range: ${range.fromBlock}..${range.toBlock} (EVM_SCAN_BLOCKS=${scanBlocks})`);

  const recipient = intent.recipient.toLowerCase() as Address;
  const minimumAmount = BigInt(intent.amount);

  if (intent.asset.type === "native") {
    let blocksIterated = 0;
    let txExamined = 0;
    const candidates: Array<{ hash: Hash; value: string; blockNumber: string }> = [];
    for (let blockNumber = range.toBlock; blockNumber >= range.fromBlock; blockNumber -= 1n) {
      blocksIterated += 1;
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      for (const tx of block.transactions) {
        if (typeof tx === "string") {
          continue;
        }
        txExamined += 1;
        if (tx.to?.toLowerCase() !== recipient) {
          continue;
        }
        candidates.push({
          hash: tx.hash,
          value: tx.value.toString(),
          blockNumber: tx.blockNumber?.toString() ?? "unknown"
        });
      }
      if (blockNumber === 0n) {
        break;
      }
    }

    console.info(`Native scan summary: blocksIterated=${blocksIterated}, txExamined=${txExamined}, recipientCandidates=${candidates.length}`);
    console.info("First recipient candidates:", candidates.slice(0, 3));
    const match = candidates.find((candidate) => BigInt(candidate.value) >= minimumAmount);
    if (!match) {
      console.error("Result: NO MATCH");
      return 1;
    }
    console.info("Result: MATCH", match);
    return 0;
  }

  if (!intent.asset.contractAddress) {
    console.error("Configuration error: ERC20 intent missing contractAddress");
    return 2;
  }

  const contractAddress = intent.asset.contractAddress.toLowerCase() as Address;
  const topic2To = pad(recipient);
  console.info("ERC20 filter params:");
  console.info({
    address: contractAddress,
    topic0: transferTopic0,
    topic2To,
    fromBlock: range.fromBlock.toString(),
    toBlock: range.toBlock.toString()
  });

  const logs = await client.getLogs({
    address: contractAddress,
    event: transferEvent,
    args: { to: recipient },
    fromBlock: range.fromBlock,
    toBlock: range.toBlock
  });
  console.info(`Logs returned: ${logs.length}`);
  const firstLogs = logs.slice(0, 3).map((log) => ({
    txHash: log.transactionHash,
    blockNumber: log.blockNumber?.toString() ?? null,
    args: log.args
  }));
  console.info("First logs:", firstLogs);

  const match = logs.find((log) => {
    const value = log.args.value;
    return log.blockNumber !== null && value !== undefined && value >= minimumAmount;
  });
  if (!match) {
    console.error("Result: NO MATCH");
    return 1;
  }
  console.info("Result: MATCH", {
    txHash: match.transactionHash,
    blockNumber: match.blockNumber?.toString() ?? null,
    value: match.args.value?.toString() ?? null
  });
  return 0;
}

void main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error("Configuration error:", error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
