# Contributing

## Prerequisites
- Node.js 20+
- npm 10+

## Setup
```bash
npm install
```

## Local Validation
```bash
npm run build
npm run test
npm run dev
```

## Coding Standards
- TypeScript strict mode is required.
- Keep architecture deterministic and non-custodial.
- Do not introduce `any` types.
- No secrets in code, docs, tests, or commit history.
- Keep scope focused (no wallet integration/custody/swap features in this repo phase).

## Pull Request Checklist
- Build passes.
- Tests pass.
- Changes are documented in `README.md` and/or `CHANGELOG.md` when relevant.
- `.env` secrets are not committed (`.env.example` only for placeholders/defaults).
