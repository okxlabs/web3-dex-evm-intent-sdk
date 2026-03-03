# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
pnpm install                  # Install all workspace dependencies
pnpm build                    # Build all packages (turbo, respects dependency order)
pnpm test                     # Run all tests (requires build first)
pnpm typecheck                # Type-check all packages
pnpm format                   # Format with prettier
pnpm format:check             # Check formatting

# Build with tsc project references (alternative to turbo)
npx tsc -b packages/common packages/contracts packages/solver

# Run a single package's tests
pnpm --filter @okx-intent-swap/sdk-solver test

# Run a specific test file
npx jest --config jest.config.js --testPathPattern packages/solver/__tests__/calldata-builder

# Build + run example
npx tsc -b packages/common packages/contracts packages/solver && cd examples/nodejs-ethers5 && pnpm build && pnpm build-calldata
```

## Architecture

**Monorepo**: pnpm workspaces + Turbo. 3 SDK packages + 1 example project.

### Package Dependency Graph

```
@okx-intent-swap/sdk-solver   → buildSettleCalldata() from /solve API data
  ├── sdk-contracts            → SETTLEMENT_ABI, ERC20_ABI (from Foundry output)
  └── sdk-common               → Order/Trade/CommissionInfo types, constants, utils

@okx-intent-swap/sdk-contracts
  └── sdk-common
```

All inter-package imports use `@okx-intent-swap/sdk-*` package names (resolved via tsconfig paths in dev, via node_modules in prod).

### Core Data Flow

```
SolveRequest + SolveResponse → buildSettleCalldata() → hex calldata → Settlement.settle()
```

### Key Type Relationships

- `SolveRequest` / `SolveResponse` (solver/types.ts) — API wire format with decimal strings
- `Trade` (common) — on-chain struct format with token index references instead of addresses
- `CommissionInfo.flag` — packed bitmask: `direction(1bit) | toB(1bit) | label(uint8)`
- `Order` (common) — user-facing order with `bigint` amounts

### Module Conventions

- All packages use `"type": "module"` (ESM)
- tsconfig: `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- **Relative imports must include `.js` extension** (e.g., `from './types.js'`)
- JSON imports require `with { type: 'json' }` attribute
- Jest uses `tsconfig.jest.json` which overrides to CommonJS for test execution
- Jest `moduleNameMapper` strips `.js` extensions for ts-jest compatibility

### Settlement Contract (Solidity)

EIP-712 domain: `name="OKX Intent Swap"`, `version="v1.0.0"`

The `settle()` function takes:
- `settleId` (from auctionId)
- `tokens[]` (deduplicated address list)
- `clearingPrices[]` (parallel to tokens, uint256)
- `trades[]` (reference tokens by index, sorted by toTokenAddressIndex ascending)
- `interactions[3]` (pre-swap, swap, post-swap)
- `surplusFeeInfo`

### Constants (common/constants.ts)

- `COMMISSION_DENOM = 1_000_000_000` (1e9 precision)
- `COMMISSION_MAX_TOTAL_PERCENT = 30_000_000` (3% max)
- `MAX_COMMISSION_ENTRIES = 3`
- `ORDER_UID_LENGTH = 56` bytes (32 digest + 20 owner + 4 validTo)

### Test Organization

Tests live at `packages/*/src/__tests__/*.test.ts`. Jest moduleNameMapper resolves `@okx-intent-swap/*` to source directories. Coverage collects from `packages/*/src/**/*.ts`.
