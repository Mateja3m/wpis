# @wpis/adapter-arbitrum

Arbitrum One adapter implementation of the `ChainAdapter` interface for developer infrastructure use.

## Deterministic Verification Model
- Strict `chainId` requirement: `eip155:42161`.
- Strict recipient matching.
- Strict amount threshold: observed value must be `>= intent.amount`.
- Strict ERC20 contract matching through the log `address` filter.
- Confirmation policy gate before `CONFIRMED`.
- Deterministic expiration at `expiresAt`.
- Scan window bounded by `EVM_SCAN_BLOCKS` equivalent adapter option (`scanBlocks`).

PoC uses recipient + amount + time window strategy for intent mapping.
This is a minimal deterministic strategy suitable for dev tooling experimentation.
Advanced mapping strategies are reserved for Phase 2.
