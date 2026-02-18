# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-02-18
### Documentation
- Improved README clarity and network positioning for `@idoa/wpis-core` and `@idoa/wpis-adapter-arbitrum`.
- Clarified infrastructure-only scope (non-custodial, deterministic verification, no wallet management/swaps/merchant services).
- Added explicit Arbitrum One support framing alongside Arbitrum Sepolia.
- Updated package-level MIT license text with project copyright attribution.

## [0.1.0] - 2026-02-16
### Added
- Core SDK (`@idoa/wpis-core`) with typed payment intent lifecycle, validation, and transition guards.
- Arbitrum adapter (`@idoa/wpis-adapter-arbitrum`) with native/ERC20 verification via `viem`.
- Verifier service (`@wpis/verifier`) with SQLite persistence, poller, and health endpoint.
- React primitives (`@wpis/react`) and MUI demo playground (`@wpis/demo`).
- Debug scripts (`scripts/seed-intent.ts`, `scripts/debug-intent.ts`) for local verification diagnostics.

### Changed
- Clarified Arbitrum network positioning: production target Arbitrum One, local test harness Arbitrum Sepolia.
- Aligned package naming and documentation to published npm packages: `@idoa/wpis-core` and `@idoa/wpis-adapter-arbitrum`.
