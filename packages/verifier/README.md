# @wpis/verifier

Minimal WPIS verification service (Express + SQLite).

## What It Does
- Stores intents and status in SQLite.
- Verifies intents via Arbitrum adapter.
- Runs background poller (10s) to progress state.

## Run
From monorepo root:

```bash
npm --workspace @wpis/verifier run dev
```

## Env Vars
- `PORT` (default `4000`)
- `EVM_RPC_URL`
- `ARBITRUM_CHAIN_ID`
- `EVM_SCAN_BLOCKS`
- `FRONTEND_ORIGIN` (optional)

## API Endpoints
- `GET /health`
- `POST /intents`
- `GET /intents/:id`
- `POST /intents/:id/verify`

## Health Check
```bash
curl http://localhost:4000/health
```
