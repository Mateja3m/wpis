# @wpis/adapter-optimism

Optimism adapter implementation of the `ChainAdapter` interface.

## Behavior
- `createIntent()`: validates input, defaults chain to `eip155:42161`, defaults confirmations to `2`, enforces reference uniqueness via callback or in-memory set.
- `buildRequest()`: builds EIP-681 links for native and ERC20 transfers.
- `verify()`: checks intent expiration, scans recent blocks/logs through `viem`, returns `PENDING | DETECTED | CONFIRMED | EXPIRED`.

## Verification limits
- Only scans latest `scanBlocks` range.
- Native matching is based on `to` and `value >= amount`.
- ERC20 matching is based on `Transfer` logs with `to` and `value >= amount`.
- Designed for PoC simplicity, not full production fraud prevention.
