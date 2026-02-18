# @idoa/wpis-adapter-arbitrum

Arbitrum infrastructure adapter for deterministic payment intent verification.
This package is non-custodial and infrastructure-focused. It does not manage wallets or act as a payment provider.

## Installation

```bash
npm i @idoa/wpis-adapter-arbitrum @idoa/wpis-core
```

## Supported Networks
- Arbitrum One (`42161`)
- Arbitrum Sepolia (`421614`)

## Quick Start

```ts
import { createArbitrumAdapter } from "@idoa/wpis-adapter-arbitrum";

const adapter = createArbitrumAdapter({
  expectedChainId: 42161,
  rpcUrl: process.env.EVM_RPC_URL
});

const intent = adapter.createIntent({
  chainId: "eip155:42161",
  recipient: "0x1111111111111111111111111111111111111111",
  amount: "1000000000000000",
  reference: "order-123",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  asset: { symbol: "ETH", decimals: 18, type: "native" }
});

const request = adapter.buildRequest(intent);
const verification = await adapter.verify(intent);

console.log(request.paymentLink, verification.status);
```

## What This Adapter Does
- Creates deterministic payment intents for Arbitrum networks.
- Builds payment request payloads (including EIP-681 style links).
- Verifies native/ERC20 payments using deterministic matching and confirmation policy checks.
- Enforces explicit chain expectations and expiration behavior.

## What It Does NOT Do
- No wallet management or key custody.
- No swaps, fiat rails, or routing logic.
- No merchant checkout or hosted payment services.
- No transaction signing on behalf of users.

## License (MIT)

Licensed under the MIT License.
