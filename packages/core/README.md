# @wpis/core

Developer-focused primitives for deterministic payment intent lifecycle and verification state management.

## Intent Lifecycle

```text
PENDING --(matching tx seen)--> DETECTED --(confirmations >= policy)--> CONFIRMED
   |                                |                                     
   |--(expiresAt reached)---------->|---------------> EXPIRED            
   |--(verification error)---------------------------------> FAILED       
```

Terminal states: `CONFIRMED`, `EXPIRED`, `FAILED`.
State regression is disallowed by transition rules.

## Verification Guarantees
- Deterministic status transitions (`transitionStatus` enforces legal edges only).
- Explicit expiration checks (`isIntentExpired` / `isExpired`).
- Validation-first intent creation guards malformed input.
- Error taxonomy is explicit and typed:
  - `VALIDATION_ERROR`
  - `RPC_ERROR`
  - `EXPIRED_ERROR`
  - `CONFIRMATION_PENDING`
  - `CHAIN_MISMATCH`

## Arbitrum Alignment
This package is chain-agnostic but designed to support Arbitrum-first adapters by:
- preserving CAIP-like chain identifiers (`eip155:42161` in adapter layer),
- enforcing deterministic status semantics needed for reproducible verifier behavior,
- separating domain logic from chain access to keep tooling composable.
