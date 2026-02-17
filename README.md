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
    /core                     -> published as @idoa/wpis-core
    /adapter-arbitrum         -> published as @idoa/wpis-adapter-arbitrum
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

## Published Packages (npm)
- `@idoa/wpis-core`
- `@idoa/wpis-adapter-arbitrum`

Install:
```bash
npm i @idoa/wpis-core @idoa/wpis-adapter-arbitrum
```

## Publishing New Versions

Prerequisites:
1. Own npm scope access for `@idoa`
2. `npm login`
3. Build/tests green

Publish commands (manual, from repo root):
```bash
npm -w packages/core publish --access public
npm -w packages/adapter-arbitrum publish --access public
```

Note: first publish of scoped package must use `--access public`. For subsequent versions, bump package versions first, then publish.

## Local Testing Without Publishing (`npm pack`)
Create tarballs:
```bash
npm run pack:core
npm run pack:adapter
```

Install tarball in a temp project:
```bash
mkdir -p /tmp/wpis-pack-test && cd /tmp/wpis-pack-test
npm init -y
npm i /absolute/path/to/wpis/idoa-wpis-core-0.1.0.tgz
npm i /absolute/path/to/wpis/idoa-wpis-adapter-arbitrum-0.1.0.tgz
```

Minimal import check (`index.mjs`):
```js
import { isIntentExpired } from "@idoa/wpis-core";
import { createArbitrumAdapter } from "@idoa/wpis-adapter-arbitrum";

console.log(typeof isIntentExpired, typeof createArbitrumAdapter);
```

Run:
```bash
node index.mjs
```

## Useful Scripts
- `npm run build:packages` - build only publishable packages
- `npm run test:packages` - test only publishable packages
- `npm run pack:core`
- `npm run pack:adapter`

## Known Limitations
- Mapping strategy is recipient + amount + active scan window.
- Scan is bounded by `EVM_SCAN_BLOCKS`; older tx can be missed.
- Native transfer matching cannot bind off-chain reference cryptographically.

## Phase 2 (Separate Proposal)
- Multi-chain adapter registry and conformance suite
- Stronger mapping/correlation strategies
- Distributed verifier coordination and richer observability
