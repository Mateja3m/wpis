# @idoa/wpis-core

Core WPIS primitives for deterministic payment intent lifecycle and verification state handling.

## Installation

```bash
npm i @idoa/wpis-core
```

## Lifecycle Diagram

```text
PENDING --(match found)--> DETECTED --(confirmations >= policy)--> CONFIRMED
   |                            |
   |--(expiresAt reached)------>|-------------------------------> EXPIRED
   |--(verification failure)-----------------------------------> FAILED
```

## Deterministic State Machine
The core package enforces legal status transitions and blocks regressions.
Transition rules are explicit and typed, so downstream tooling gets predictable lifecycle behavior.

## Quick Example

```ts
import { transitionStatus, validateCreateIntentInput, type CreateIntentInput } from "@idoa/wpis-core";

const input: CreateIntentInput = {
  chainId: "eip155:42161",
  recipient: "0x1111111111111111111111111111111111111111",
  amount: "1000000000000000",
  reference: "order-123",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  asset: { symbol: "ETH", decimals: 18, type: "native" }
};

validateCreateIntentInput(input);
const next = transitionStatus("PENDING", "DETECTED");
console.log(next);
```

## Design Principles
- Deterministic lifecycle transitions.
- Strict input validation and explicit error taxonomy.
- Non-custodial architecture boundaries.
- Chain adapter separation from core domain logic.

## Intended Usage
Use this package as the typed lifecycle foundation for verifier services, adapters, and integration tooling.
It is infrastructure-focused and not intended to be a checkout or merchant product layer.

## License (MIT)

Licensed under the MIT License.
