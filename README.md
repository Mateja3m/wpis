# WPIS - Web3 Payment Infrastructure Standard (Arbitrum PoC)

Infrastructure-only developer tooling primitive for deterministic payment intent verification on Arbitrum One.

## Why This Is Dev Tooling
- Provides a reusable SDK + verifier pattern for protocol teams, indexers, relayers, and app developers.
- Focuses on deterministic state transitions and verification correctness, not merchant UX.
- Runs as self-hosted infrastructure in developer-controlled environments.

## Arbitrum Ecosystem Benefit
- Standardizes intent verification semantics for Arbitrum networks.
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
5. Demo playground polls `GET /intents/:id`; verifier poller is the canonical verification writer.

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

## Environment (Default: Arbitrum Sepolia)
```bash
cp .env.example .env
```

Variables:
- `EVM_RPC_URL`: Arbitrum RPC URL (default points to Arbitrum Sepolia).
- `ARBITRUM_CHAIN_ID`: expected EVM chain id (Sepolia `421614`, mainnet `42161`).
- `EVM_SCAN_BLOCKS`: verification scan depth window (default `150` for Sepolia dev feedback).
- `PORT`: verifier HTTP port.
- `NEXT_PUBLIC_VERIFIER_URL`: frontend target verifier URL.
- `NEXT_PUBLIC_CHAIN_ID`: chain id sent by demo app (`eip155:421614` for Sepolia).

## Run
```bash
npm install
npm run build
npm run test
npm run dev
```

- Playground UI (`@wpis/demo`): `http://localhost:3000`
- Verifier API (`@wpis/verifier`): `http://localhost:4000`
  - Health: `http://localhost:4000/health`
  - Intents: `http://localhost:4000/intents`
- Runtime ownership:
  - `:3000` UI only displays intent state and polls `GET /intents/:id`.
  - `:4000` verifier performs verification via background poller every 10s.

Troubleshooting:
- If `Create Intent` fails with `ERR_CONNECTION_REFUSED`, verify `http://localhost:4000/health` is reachable.

## Test on Arbitrum Sepolia (Realistic Flow)
1. Keep default `.env` values from `.env.example` (Sepolia settings).
2. Run `npm run dev`.
3. Create intent in UI.
4. Send a real matching Sepolia ETH/ERC20 transfer from an external wallet:
   - recipient must match intent recipient,
   - amount must be `>=` intent amount,
   - for ERC20, token contract must match.
5. Wait for chain confirmations:
   - demo creates intents with `minConfirmations=1` on Sepolia, so status can confirm faster.

Note: verification is automatic.

## Switch to Arbitrum One (Production Network)
Update `.env`:
- `EVM_RPC_URL=https://arb1.arbitrum.io/rpc`
- `ARBITRUM_CHAIN_ID=42161`
- `NEXT_PUBLIC_CHAIN_ID=eip155:42161`

Restart dev services after env changes.

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
