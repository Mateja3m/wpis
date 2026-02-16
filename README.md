# WPIS - Web3 Payment Infrastructure Standard (Arbitrum PoC) - Work in Progress

Infrastructure-only developer tooling primitive for deterministic payment intent verification.

## Positioning
- Production target network: Arbitrum One (`42161`)
- Test harness network for this PoC and local validation: Arbitrum Sepolia (`421614`)
- Scope: infrastructure/tooling only, not a payment provider, checkout, custody, or wallet product.

## Why This Is Dev Tooling
- Provides reusable SDK + verifier building blocks for protocol teams and app developers.
- Standardizes deterministic intent lifecycle handling and verification outcomes.
- Runs as self-hosted infra in developer-controlled environments.

## Scope (Phase 1 PoC)
- `@wpis/core`: typed intent model, validation, error taxonomy, state transitions.
- `@wpis/adapter-arbitrum`: Arbitrum adapter (`viem`) for intent request construction + verification.
- `@wpis/verifier`: SQLite-backed verifier API + poller.
- `@wpis/react`: minimal reusable UI primitives.
- `@wpis/demo`: MUI developer playground for integration testing.

## What This Does Not Solve
- No wallet integration.
- No custody/private key handling.
- No swaps, fiat rails, hosted checkout, merchant dashboard.
- No multi-chain routing in this phase.

## Architecture Summary
1. `POST /intents` creates a deterministic `PaymentIntent`.
2. Intent is persisted in SQLite.
3. Poller verifies on-chain activity and applies strict state transition rules.
4. `GET /intents/:id` exposes current status + latest verification metadata.
5. UI polls status; verifier is canonical writer of lifecycle updates.

## Monorepo Structure
```text
/wpis
  /packages
    /core
    /adapter-arbitrum
    /verifier
    /react
  /demo-app
  /scripts
```

## Milestones & Acceptance Criteria
### M1 - Core + Adapter
- Core types, deterministic lifecycle rules, strict validation.
- Arbitrum adapter creates intents, builds EIP-681 payload, verifies native/ERC20 matches.
- Acceptance: unit tests for validation/state transitions/adapter matching pass.

### M2 - Verifier + Hardening
- Verifier API + SQLite persistence + poller.
- Health endpoint with RPC + chain + DB signals.
- Idempotent transition handling and structured verify events.
- Acceptance: verification updates are deterministic and non-regressive.

### M3 - Playground + Reference Integrations + v1.0.0
- Developer Playground UI for manual send + lifecycle observation.
- Two reference integration examples documented in repo (service + UI consumption patterns).
- Release process documented for `v1.0.0` tagging.
- Acceptance: `npm run build`, `npm run test`, and local end-to-end flow pass.

## Environment
Copy env template:
```bash
cp .env.example .env
```

Key variables:
- `EVM_RPC_URL`: RPC endpoint (`421614` for local harness, `42161` for production target).
- `ARBITRUM_CHAIN_ID`: expected chain id in verifier.
- `EVM_SCAN_BLOCKS`: scan depth window.
- `PORT`: verifier API port.
- `NEXT_PUBLIC_VERIFIER_URL`: demo -> verifier URL.
- `NEXT_PUBLIC_CHAIN_ID`: CAIP-2 chain id used by demo when creating intents.

## Run Locally
```bash
npm install
npm run build
npm run test
npm run dev
```

Endpoints:
- UI: [http://localhost:3000](http://localhost:3000)
- Verifier: [http://localhost:4000](http://localhost:4000)
- Health: [http://localhost:4000/health](http://localhost:4000/health)

## Debugging Pending Intents
Check in this order:
1. Chain mismatch: `GET /health` must report configured `ARBITRUM_CHAIN_ID`.
2. Scan window: tx block must be in `[latest - EVM_SCAN_BLOCKS, latest]`.
3. Amount conversion: intent amount is base units; on-chain value must be `>= intent.amount`.
4. Recipient/contract match: recipient exact match; ERC20 contract must match `intent.asset.contractAddress`.

Useful scripts:
```bash
npm run seed:intent -- --recipient 0xYourAddress --amount 100000000000000 --chain-id eip155:421614
DEBUG_WPIS=1 npm run debug:intent -- --intent-id <INTENT_ID> --verifier-url http://localhost:4000
```

## Confirmations Semantics
- Confirmations are computed as: `latestBlock - matchedBlockNumber + 1`.
- `DETECTED`: match found but below required confirmations.
- `CONFIRMED`: match found and confirmation policy met.

## Known Limitations
- Mapping strategy is recipient + amount + active scan window.
- Native transfer mapping cannot cryptographically bind off-chain reference by itself.
- Scan is bounded by `EVM_SCAN_BLOCKS`; older tx can be missed.
- Single-node verifier assumptions for this PoC.

## Phase 2 (Separate Proposal)
- Multi-chain adapter registry + conformance tests.
- Stronger intent mapping (reference anchoring/correlation strategies).
- Distributed verifier coordination and queue-backed polling.
- Expanded observability and SLO-driven operations.

## Release Notes / Tagging
- Current PoC baseline: `v0.1.0` (see `CHANGELOG.md`).
- Planned stable release tagging steps:
  1. Ensure clean tree + passing `npm run build && npm run test`.
  2. Run `npm run release:tag:v1.0.0`.
  3. Push tag with `npm run release:push-tags`.

## API
- `GET /health`
- `POST /intents`
- `GET /intents/:id`
- `POST /intents/:id/verify`
