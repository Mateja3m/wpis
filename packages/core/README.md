# @idoa/wpis-core

Core WPIS types and deterministic intent lifecycle utilities.

## Install

```bash
npm i @idoa/wpis-core
```

## Usage

```ts
import { validateCreateIntentInput, transitionStatus, type CreateIntentInput } from "@idoa/wpis-core";

const input: CreateIntentInput = {
  chainId: "eip155:421614",
  recipient: "0x1111111111111111111111111111111111111111",
  amount: "1000000000000000",
  reference: "example-reference",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  asset: { symbol: "ETH", decimals: 18, type: "native" }
};

validateCreateIntentInput(input);
const next = transitionStatus("PENDING", "DETECTED");
```

For monorepo development, see the repository root README.
