# WPIS - Web3 Payment Infrastructure Standard (Arbitrum PoC)

Infrastructure-only developer tooling primitive for deterministic payment intent verification.

## Positioning
- Production target network: Arbitrum One (`42161`)
- Test harness network for local PoC validation: Arbitrum Sepolia (`421614`)
- Scope: infrastructure/tooling only, not a payment provider, checkout, custody, or wallet product.

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

## Local Development (Monorepo)
```bash
npm install
npm run build
npm run test
npm run dev
```

Endpoints:
- UI: [http://localhost:3000](http://localhost:3000)
- Verifier API: [http://localhost:4000](http://localhost:4000)
- Health: [http://localhost:4000/health](http://localhost:4000/health)

## Demo App Testing Flow
1. Open `http://localhost:3000`.
2. Confirm backend banner shows connected to `http://localhost:4000`.
3. Enter recipient + amount and create intent.
4. In modal, follow manual send instructions on Arbitrum Sepolia.
5. Keep modal open while verifier poller updates status.
6. Verify transition path: `PENDING` -> `DETECTED` -> `CONFIRMED` (or `EXPIRED`).

## Environment
```bash
cp .env.example .env
```

Key variables:
- `EVM_RPC_URL`
- `ARBITRUM_CHAIN_ID`
- `EVM_SCAN_BLOCKS`
- `PORT`
- `NEXT_PUBLIC_VERIFIER_URL`
- `NEXT_PUBLIC_CHAIN_ID`

## Useful Scripts
- `npm run build:packages` - build only publishable packages
- `npm run test:packages` - test only publishable packages
- `npm run pack:core`
- `npm run pack:adapter`

## Published npm Packages
- `@idoa/wpis-core`
- `@idoa/wpis-adapter-arbitrum`

## Known Limitations
- Mapping strategy is recipient + amount + active scan window.
- Scan is bounded by `EVM_SCAN_BLOCKS`; older tx can be missed.
- Native transfer matching cannot bind off-chain reference cryptographically.

## Phase 2 (Separate Proposal)
- Multi-chain adapter registry and conformance suite
- Stronger mapping/correlation strategies
- Distributed verifier coordination and richer observability
