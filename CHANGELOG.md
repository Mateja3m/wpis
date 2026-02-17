# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-16
### Added
- Core SDK (`@idoa/wpis-core`) with typed payment intent lifecycle, validation, and transition guards.
- Arbitrum adapter (`@idoa/wpis-adapter-arbitrum`) with native/ERC20 verification via `viem`.
- Verifier service (`@wpis/verifier`) with SQLite persistence, poller, and health endpoint.
- React primitives (`@wpis/react`) and MUI demo playground (`@wpis/demo`).
- Debug scripts (`scripts/seed-intent.ts`, `scripts/debug-intent.ts`) for local verification diagnostics.

### Changed
- Clarified Arbitrum network positioning: production target Arbitrum One, local test harness Arbitrum Sepolia.
