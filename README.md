# OKX Intent Swap SDK

TypeScript SDK for building `Settlement.settle()` calldata — converts Solver API `/solve` request + response into ABI-encoded calldata ready for on-chain submission.

## Installation

```bash
pnpm add @okx-intent-swap/sdk-solver ethers@^5.7.0
```

## Packages

| Package | Description |
| ------- | ----------- |
| `@okx-intent-swap/sdk-solver` | Solver calldata builder (`buildSettleCalldata`) |
| `@okx-intent-swap/sdk-common` | Core types, constants, and utilities |
| `@okx-intent-swap/sdk-contracts` | Settlement contract ABI |

---

## Quick Start

```typescript
import { buildSettleCalldata } from '@okx-intent-swap/sdk-solver';
import { ethers } from 'ethers';

// Step 1: Receive /solve request & compute your solution (response)
const request = await receiveAuctionRequest();   // SolveRequest
const response = await computeSolution(request); // SolveResponse

// Step 2: Build calldata (interactions = [pre, swap, post] phases, empty by default)
const { calldata } = buildSettleCalldata(request, response, {
  interactions: [[], [], []],
});

// Step 3: Submit settle() transaction
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const solver = new ethers.Wallet(SOLVER_PK, provider);
const tx = await solver.sendTransaction({
  to: SETTLEMENT_CONTRACT,
  data: calldata,
});
await tx.wait();
```

## API Types: SolveRequest / SolveResponse

The SDK defines strict types for the `/solve` endpoint wire format.

### SolveRequest

```typescript
interface SolveRequest {
  auctionId: string;             // Auction ID → becomes settleId on-chain
  orders: SolveRequestOrder[];
}

interface SolveRequestOrder {
  fromTokenAddress: string;      // Token to sell
  toTokenAddress: string;        // Token to buy
  owner: string;                 // Order signer address
  receiver: string;              // Proceeds recipient (owner if same)
  fromTokenAmount: string;       // Sell amount (decimal string)
  toTokenAmount: string;         // Min buy amount (decimal string)
  validTo: number;               // Expiry (unix seconds)
  appDataHash: string;           // Application data (bytes32 hex)
  swapMode: string;              // "exactIn" | "exactOut"
  partiallyFillable: boolean;
  signingScheme: string;         // "eip712" | "ethSign" | "eip1271" | "preSign"
  signature: string;             // Order signature (hex)
  commissionInfos: ApiCommissionInfo[];
}
```

### SolveResponse

```typescript
interface SolveResponse {
  solutions: Solution[];         // Typically one solution
}

interface Solution {
  clearingPrices: Record<string, string>;  // tokenAddress → price (decimal string)
  orders: SolveResponseOrder[];            // Parallel to request.orders
  surplusFeeInfo: ApiSurplusFeeInfo;       // Protocol surplus fee config
}

interface SolveResponseOrder {
  executedFromTokenAmount: string;  // Actual sell amount (decimal string)
  executedToTokenAmount: string;    // Actual buy amount (decimal string)
  commissionInfos: ApiCommissionInfo[];
  solverFeeInfo: ApiSolverFeeInfo;
}
```

### Fee Types

```typescript
interface ApiCommissionInfo {
  feePercent: string;              // Rate in 1e9 precision ("3000000" = 0.3%)
  referrerWalletAddress: string;   // Fee recipient
  feeDirection: boolean;           // true = fromToken, false = toToken
  toB: boolean;                    // true = Settlement pays, false = user pays
  commissionType: string;          // "okx" | "parent" | "child"
}

interface ApiSolverFeeInfo {
  feePercent: string;              // Solver fee rate (1e9 precision)
  solverAddress: string;
  feeDirection: boolean;           // true = fromToken, false = toToken
  feeAmount: string;               // Informational total amount
}

interface ApiSurplusFeeInfo {
  feePercent: string;              // Surplus fee rate (1e9 precision)
  trimReceiver: string;            // Protocol fee recipient
  flag: string;                    // Flag value
}
```

> **Note:** The raw API response may be wrapped in `{ code, msg, data: { solutions } }`. You need to unwrap it before passing to `buildSettleCalldata()`. See the [full example](examples/nodejs-ethers5/src/build-calldata.ts) for the unwrapping pattern.

## Clearing Prices: Two Modes

`buildSettleCalldata` supports two strategies for computing clearing prices:

### Mode 1: API Prices (default)

Uses `solution.clearingPrices` from the API response directly. The SDK converts decimal string ratios into uint256 integers by scaling all prices to the same decimal precision.

```typescript
const { calldata } = buildSettleCalldata(request, response, {
  interactions: [[], [], []],
});
```

**When to use:** Your solver API already returns well-formed clearing prices.

### Mode 2: Computed Prices

Derives clearing prices from execution amounts and fees. For each order:
- `P_sell = executedToTokenAmount` (buy-side price)
- `P_buy = executedFromTokenAmount - totalFromTokenFees` (sell-side price minus fees)

```typescript
const { calldata } = buildSettleCalldata(request, response, {
  interactions: [[], [], []],
  useComputedPrices: true,
});
```

**When to use:** You want prices that exactly match the execution amounts, or when handling complex multi-token batches where API prices may not capture fee adjustments precisely.

## buildSettleCalldata Options

```typescript
interface BuildSettleCalldataOptions {
  interactions?: [Interaction[], Interaction[], Interaction[]];  // [pre, swap, post]
  solutionIndex?: number;    // Which solution to use (default: 0)
  useComputedPrices?: boolean; // Derive prices from execution data (default: false)
}
```

## What buildSettleCalldata Does Internally

1. Parse `auctionId` → `settleId` (bigint)
2. Collect all unique token addresses → `tokens[]`
3. Convert clearing prices (decimal string → uint256)
4. Build `Trade[]` by merging request orders + response execution data
5. Pack commission flags (direction + ToB + label → single uint256 bitmask)
6. Sort trades by `toTokenAddressIndex` ascending (Settlement contract requirement)
7. ABI-encode everything as `Settlement.settle()` calldata

## Examples

See [`examples/nodejs-ethers5/src/build-calldata.ts`](examples/nodejs-ethers5/src/build-calldata.ts) — demonstrates how to transform raw `/solve` API JSON into SDK types and produce ABI-encoded calldata.

```bash
cd examples/nodejs-ethers5
pnpm build && pnpm build-calldata
```

## Development

```bash
pnpm install       # Install dependencies
pnpm build         # Build all packages
pnpm test          # Run tests (76 tests)
pnpm typecheck     # Type check
```

## License

MIT
