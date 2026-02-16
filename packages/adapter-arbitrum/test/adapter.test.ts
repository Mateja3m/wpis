import { describe, expect, it } from "vitest";
import { getAddress, pad, parseAbiItem, toEventSelector } from "viem";
import type { PaymentIntent } from "@wpis/core";
import {
  ArbitrumAdapter,
  buildErc20TransferLogQuery,
  computeScanRange,
  type EvmClient,
  type EvmTransaction
} from "../src/index.js";

function createIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: "intent-1",
    createdAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    chainId: "eip155:421614",
    asset: { symbol: "ETH", decimals: 18, type: "native" },
    recipient: "0x1111111111111111111111111111111111111111",
    amount: "100",
    reference: "ref-1",
    confirmationPolicy: { minConfirmations: 2 },
    status: "PENDING",
    ...overrides
  };
}

class MockClient implements EvmClient {
  public constructor(
    private readonly chainId: number,
    private readonly blockNumber: bigint,
    private readonly transactionsByBlock: Record<string, EvmTransaction[]>,
    private readonly logs: Array<{
      transactionHash: `0x${string}` | null;
      blockNumber: bigint | null;
      args: { to?: `0x${string}`; value?: bigint };
    }> = []
  ) {}

  public async getChainId(): Promise<number> {
    return this.chainId;
  }

  public async getBlockNumber(): Promise<bigint> {
    return this.blockNumber;
  }

  public async getBlock(args: { blockNumber: bigint; includeTransactions: true }): Promise<{ transactions: EvmTransaction[] }> {
    return { transactions: this.transactionsByBlock[args.blockNumber.toString()] ?? [] };
  }

  public async getLogs(_: {
    address: `0x${string}`;
    event: unknown;
    args: { to: `0x${string}` };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<
    Array<{
      transactionHash: `0x${string}` | null;
      blockNumber: bigint | null;
      args: { to?: `0x${string}`; value?: bigint };
    }>
  > {
    return this.logs;
  }
}

describe("ArbitrumAdapter", () => {
  it("computes inclusive scan range with zero floor", () => {
    expect(computeScanRange(1000n, 150n)).toEqual({ fromBlock: 850n, toBlock: 1000n });
    expect(computeScanRange(100n, 500n)).toEqual({ fromBlock: 0n, toBlock: 100n });
  });

  it("builds erc20 transfer query using to-address args and transfer topic", () => {
    const query = buildErc20TransferLogQuery(
      "0x2222222222222222222222222222222222222222",
      "0x1111111111111111111111111111111111111111",
      50n,
      100n
    );
    const topic0 = toEventSelector(query.event);
    const expectedTopic0 = toEventSelector(parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"));

    expect(query.address).toBe("0x2222222222222222222222222222222222222222");
    expect(query.args.to).toBe(getAddress("0x1111111111111111111111111111111111111111"));
    expect(query.fromBlock).toBe(50n);
    expect(query.toBlock).toBe(100n);
    expect(topic0).toBe(expectedTopic0);
    expect(pad(query.args.to)).toBe("0x0000000000000000000000001111111111111111111111111111111111111111");
  });

  it("creates intents with arbitrum defaults and unique references", () => {
    const adapter = new ArbitrumAdapter({ client: new MockClient(421614, 100n, {}) });

    const intent = adapter.createIntent({
      asset: { symbol: "ETH", decimals: 18, type: "native" },
      recipient: "0x1111111111111111111111111111111111111111",
      amount: "1",
      reference: "order-1",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    expect(intent.chainId).toBe("eip155:421614");
    expect(intent.confirmationPolicy.minConfirmations).toBe(2);

    expect(() =>
      adapter.createIntent({
        asset: { symbol: "ETH", decimals: 18, type: "native" },
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "1",
        reference: "order-1",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toThrow(/unique/);
  });

  it("rejects non-arbitrum chain id during creation", () => {
    const adapter = new ArbitrumAdapter({ client: new MockClient(421614, 100n, {}) });

    expect(() =>
      adapter.createIntent({
        chainId: "eip155:42161",
        asset: { symbol: "ETH", decimals: 18, type: "native" },
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "1",
        reference: "order-2",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toThrow(/chainId/);
  });

  it("returns confirmed for native transfer with enough confirmations", async () => {
    const tx: EvmTransaction = {
      hash: "0xabc",
      to: "0x1111111111111111111111111111111111111111",
      value: 100n,
      blockNumber: 99n
    };
    const client = new MockClient(421614, 100n, { "100": [], "99": [tx] });
    const adapter = new ArbitrumAdapter({ client, scanBlocks: 10n });

    const result = await adapter.verify(createIntent());

    expect(result.status).toBe("CONFIRMED");
    expect(result.txHash).toBe("0xabc");
    expect(result.confirmations).toBe(2);
  });

  it("returns detected with CONFIRMATION_PENDING for erc20 below policy", async () => {
    const client = new MockClient(421614, 100n, {}, [
      {
        transactionHash: "0xdef",
        blockNumber: 100n,
        args: {
          to: "0x1111111111111111111111111111111111111111",
          value: 300n
        }
      }
    ]);
    const adapter = new ArbitrumAdapter({ client, scanBlocks: 10n });

    const result = await adapter.verify(
      createIntent({
        asset: {
          symbol: "USDC",
          decimals: 6,
          type: "erc20",
          contractAddress: "0x2222222222222222222222222222222222222222"
        },
        amount: "100"
      })
    );

    expect(result.status).toBe("DETECTED");
    expect(result.errorCode).toBe("CONFIRMATION_PENDING");
    expect(result.confirmations).toBe(1);
  });

  it("returns chain mismatch when rpc chain is not arbitrum sepolia", async () => {
    const adapter = new ArbitrumAdapter({ client: new MockClient(42161, 100n, {}), scanBlocks: 10n });

    const result = await adapter.verify(createIntent());

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("CHAIN_MISMATCH");
  });

  it("returns expired when intent expiry has passed", async () => {
    const adapter = new ArbitrumAdapter({
      client: new MockClient(421614, 100n, {}),
      now: () => new Date("2099-01-02T00:00:00.000Z")
    });

    const result = await adapter.verify(createIntent({ expiresAt: "2099-01-01T00:00:00.000Z" }));

    expect(result.status).toBe("EXPIRED");
    expect(result.errorCode).toBe("EXPIRED_ERROR");
  });
});
