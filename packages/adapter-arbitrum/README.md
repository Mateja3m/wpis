# @idoa/wpis-adapter-arbitrum

Arbitrum adapter for WPIS payment intent request building and verification.

## Install

```bash
npm i @idoa/wpis-adapter-arbitrum @idoa/wpis-core
```

## Usage

```ts
import { createArbitrumAdapter } from "@idoa/wpis-adapter-arbitrum";

const adapter = createArbitrumAdapter({
  expectedChainId: 421614,
  rpcUrl: process.env.EVM_RPC_URL
});

const intent = adapter.createIntent({
  chainId: "eip155:421614",
  recipient: "0x1111111111111111111111111111111111111111",
  amount: "1000000000000000",
  reference: "example-reference",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  asset: { symbol: "ETH", decimals: 18, type: "native" }
});

const request = adapter.buildRequest(intent);
console.log(request.paymentLink);
```

For monorepo development and verifier/demo integration, see the repository root README.
