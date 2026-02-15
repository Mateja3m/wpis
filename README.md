# WPIS - Web3 Payment Infrastructure Standard (PoC)

Minimal production-quality proof of concept for chain-agnostic payment intents and verification.

## Scope
- `@wpis/core`: canonical payment intent domain model, validation, state machine, expiration helpers.
- `@wpis/adapter-arbitrum`: Optimism EVM adapter using `viem`.
- `@wpis/verifier`: verification API + background poller with SQLite persistence.
- `@wpis/react`: minimal reusable payment UI components.
- `@wpis/demo-next`: Next.js demo app that creates intents and displays live status.

## Architecture
1. Client creates an intent through verifier `POST /intents`.
2. Verifier calls `OptimismAdapter.createIntent()` and stores the intent JSON in SQLite.
3. Verifier returns `paymentRequest` (EIP-681 link + instructions).
4. Client displays QR/instructions and polls `GET /intents/:id`.
5. Verifier validates on-demand (`POST /intents/:id/verify`) and in background every 10s.
6. Status updates follow strict transitions (`PENDING -> DETECTED -> CONFIRMED`, with terminal `EXPIRED/FAILED`).

## Monorepo
```
/wpis
  /packages
    /core
    /adapter-arbitrum
    /verifier
    /react
  /apps
    /demo-next
```

## Environment
Copy `.env.example` values:
- `EVM_RPC_URL`: Optimism RPC endpoint used by verifier.
- `PORT`: verifier HTTP port (default `4000`).
- `NEXT_PUBLIC_VERIFIER_URL`: demo app backend URL.

## Local Run
```bash
npm install
npm run build
npm run test
npm run dev
```

- Verifier: `http://localhost:4000`
- Demo app: `http://localhost:3000`

## API
- `POST /intents` -> creates intent and returns `{ intent, paymentRequest }`
- `GET /intents/:id` -> returns current `{ intent, status }`
- `POST /intents/:id/verify` -> runs verification and updates state

## Non-custodial Guarantees
- No private key handling.
- No signing or custody logic.
- Verification relies only on public chain data.

## Known limitations (PoC)
- Verification scans only recent blocks (`scanBlocks`) and can miss older transactions.
- Native transfer matching is recipient/value based only (no sender/reference binding on-chain).
- ERC20 verification checks `Transfer` events only and does not decode non-standard token behavior.
- Reference uniqueness is enforced at application layer, not by dedicated DB index over JSON field.
- Single verifier instance assumptions (no distributed locking).
