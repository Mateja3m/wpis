import { randomUUID } from "node:crypto";

interface Args {
  verifierUrl: string;
  recipient: string;
  amount: string;
  chainId: string;
  assetType: "native" | "erc20";
  contractAddress?: string;
  expiresInMinutes: number;
  minConfirmations: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    verifierUrl: "http://localhost:4000",
    recipient: "0x1111111111111111111111111111111111111111",
    amount: "100000000000000",
    chainId: "eip155:421614",
    assetType: "native",
    expiresInMinutes: 15,
    minConfirmations: 1
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) {
      continue;
    }
    if (arg === "--verifier-url") {
      args.verifierUrl = value;
      index += 1;
    } else if (arg === "--recipient") {
      args.recipient = value;
      index += 1;
    } else if (arg === "--amount") {
      args.amount = value;
      index += 1;
    } else if (arg === "--chain-id") {
      args.chainId = value;
      index += 1;
    } else if (arg === "--asset-type") {
      if (value === "native" || value === "erc20") {
        args.assetType = value;
      }
      index += 1;
    } else if (arg === "--contract-address") {
      args.contractAddress = value;
      index += 1;
    } else if (arg === "--expires-minutes") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        args.expiresInMinutes = parsed;
      }
      index += 1;
    } else if (arg === "--min-confirmations") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        args.minConfirmations = parsed;
      }
      index += 1;
    }
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.assetType === "erc20" && !args.contractAddress) {
    console.error("Configuration error: --contract-address is required for --asset-type erc20");
    return 2;
  }

  const expiresAt = new Date(Date.now() + args.expiresInMinutes * 60_000).toISOString();
  const response = await fetch(`${args.verifierUrl}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: args.recipient,
      amount: args.amount,
      reference: `seed-${randomUUID()}`,
      expiresAt,
      chainId: args.chainId,
      confirmationPolicy: { minConfirmations: args.minConfirmations },
      asset:
        args.assetType === "native"
          ? { symbol: "ETH", decimals: 18, type: "native" }
          : { symbol: "USDC", decimals: 6, type: "erc20", contractAddress: args.contractAddress }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Create intent failed: HTTP ${response.status}`);
    console.error(body);
    return 1;
  }

  const payload = (await response.json()) as { intent: { id: string } };
  console.info(`intentId=${payload.intent.id}`);
  return 0;
}

void main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
