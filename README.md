# WPIS - Web3 Payment Infrastructure Standard (Arbitrum One PoC)

Infrastructure-only developer tooling primitive for deterministic payment intent verification on Arbitrum One.

## Why This Is Dev Tooling
- Provides a reusable SDK + verifier pattern for protocol teams, indexers, relayers, and app developers.
- Focuses on deterministic state transitions and verification correctness, not merchant UX.
- Runs as self-hosted infrastructure in developer-controlled environments.

## Arbitrum Ecosystem Benefit
- Standardizes intent verification semantics for Arbitrum One (`42161`).
- Reduces duplicated verification logic across ecosystem projects.
- Improves reliability of off-chain tooling that depends on on-chain payment detection.

## Scope (PoC)
- `@wpis/core`: intent model, validation, typed error taxonomy, lifecycle state machine.
- `@wpis/adapter-arbitrum`: Arbitrum One adapter using `viem`.
- `@wpis/verifier`: SQLite-backed verification API with polling + health endpoint.
- `@wpis/react`: minimal reusable payment UI primitives.
- `@wpis/demo`: MUI developer playground reference app.

## What This Does Not Solve
- Not a payment provider.
- Not a checkout product.
- No wallet integration.
- No custody or key management.
- No swaps, fiat rails, hosted merchant features, or multi-chain routing.

## Architecture Summary
1. `POST /intents` creates a deterministic `PaymentIntent` via Arbitrum adapter.
2. Intent JSON and lifecycle state are persisted in SQLite.
3. Verification (`POST /intents/:id/verify` and poller) applies strict state transition guards.
4. Health endpoint (`GET /health`) reports RPC connectivity, chain id, and DB availability.
5. Demo playground consumes verifier APIs for development/testing.

## Monorepo Structure
```text
/Users/milanmatejic/Desktop/personal/Projects/wpis
  /packages
    /core
    /adapter-arbitrum
    /verifier
    /react
  /demo-app
```

## Environment
```bash
cp .env.example .env
```

Variables:
- `EVM_RPC_URL`: Arbitrum One RPC URL.
- `EVM_SCAN_BLOCKS`: verification scan depth window.
- `PORT`: verifier HTTP port.
- `NEXT_PUBLIC_VERIFIER_URL`: frontend target verifier URL.

## Run
```bash
npm install
npm run build
npm run test
npm run dev
```

- Verifier: `http://localhost:4000`
- Playground: `http://localhost:3000`

## API
- `GET /health`
- `POST /intents`
- `GET /intents/:id`
- `POST /intents/:id/verify`

## Known Limitations (PoC)
- Recipient + amount + scan-window mapping only.
- Scan bounded by `EVM_SCAN_BLOCKS`; older matches outside window are ignored.
- Native transfer matching cannot cryptographically bind off-chain reference to on-chain transaction.
- Single-service deployment assumptions (no distributed coordination).

## Phase 2 Roadmap (Out of Scope for This PoC)
- Multi-chain adapter registry with conformance tests.
- Advanced mapping strategies (memo/reference anchoring, stronger correlation signals).
- Horizontal verifier coordination and durable queue-based polling.
- Expanded observability and SLO instrumentation.
