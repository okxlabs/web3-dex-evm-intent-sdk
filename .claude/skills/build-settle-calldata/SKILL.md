---
name: build-settle-calldata
description: Guide through constructing Settlement.settle() calldata from /solve API data using @okx-intent-swap/sdk-solver
user-invocable: true
argument-hint: [json-file-path]
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Build Settlement Calldata

Guide the user through constructing `Settlement.settle()` calldata from `/solve` API data.

If `$ARGUMENTS` is a file path, read the file and generate concrete code. If empty or "help", explain the full workflow.

## Core Data Flow

```
SolveRequest + SolveResponse → buildSettleCalldata() → hex calldata → Settlement.settle()
```

## Step 1: Understand API Types

### SolveRequest (request body)

```typescript
interface SolveRequest {
  auctionId: string;           // becomes settleId (bigint)
  orders: SolveRequestOrder[];
}

interface SolveRequestOrder {
  fromTokenAddress: string;
  toTokenAddress: string;
  owner: string;
  receiver: string;
  fromTokenAmount: string;     // decimal string
  toTokenAmount: string;       // decimal string (minimum)
  validTo: number;             // unix timestamp (seconds)
  appDataHash: string;         // bytes32 hex
  swapMode: string;            // "exactIn" | "exactOut"
  partiallyFillable: boolean;
  signingScheme: string;       // "eip712" | "ethSign" | "eip1271" | "preSign"
  signature: string;           // hex
  commissionInfos: ApiCommissionInfo[];
}
```

### SolveResponse (response body)

```typescript
interface SolveResponse {
  solutions: Solution[];       // typically 1 solution
}

interface Solution {
  clearingPrices: Record<string, string>;  // lowercase token address → decimal string
  orders: SolveResponseOrder[];            // parallel to request.orders
  surplusFeeInfo: ApiSurplusFeeInfo;
}

interface SolveResponseOrder {
  executedFromTokenAmount: string;
  executedToTokenAmount: string;
  commissionInfos: ApiCommissionInfo[];
  solverFeeInfo: ApiSolverFeeInfo;
}
```

### Fee Types

```typescript
interface ApiCommissionInfo {
  feePercent: string;              // 1e9 precision decimal string
  referrerWalletAddress: string;
  feeDirection: boolean;           // true = fromToken, false = toToken
  toB: boolean;                    // true = Settlement pays, false = user pays
  commissionType: string;          // "okx" | "parent" | "child"
}

interface ApiSolverFeeInfo {
  feePercent: string;
  solverAddress: string;
  feeDirection: boolean;
  feeAmount: string;               // informational, not stored on-chain
}

interface ApiSurplusFeeInfo {
  feePercent: string;
  trimReceiver: string;
  flag: string;
}
```

## Step 2: Prepare API Data

Strip envelope/extra fields to match SDK types:

```typescript
const rawApiResponse = await fetch('/solve', { ... }).then(r => r.json());

const request: SolveRequest = {
  auctionId: rawApiResponse.auctionId,
  orders: rawApiResponse.orders,
};

const response: SolveResponse = {
  solutions: rawApiResponse.solutions,
};
```

All numeric amounts are **decimal strings** (not `bigint`). The SDK converts internally.

## Step 3: Build Interactions (if needed)

```typescript
import type { Interaction } from '@okx-intent-swap/sdk-common';

// [pre-swap, swap, post-swap]
const interactions: [Interaction[], Interaction[], Interaction[]] = [
  [],
  [
    { target: fromTokenAddress, value: 0n, callData: erc20ApproveCalldata },
    { target: dexRouterAddress, value: 0n, callData: swapCalldata },
  ],
  [],
];
```

Default is `[[], [], []]` (no interactions).

## Step 4: Call buildSettleCalldata

```typescript
import {
  buildSettleCalldata,
  type SolveRequest,
  type SolveResponse,
} from '@okx-intent-swap/sdk-solver';

const result = buildSettleCalldata(request, response, {
  // interactions: [[], [], []],    // default: no interactions
  // solutionIndex: 0,              // default: first solution
  // useComputedPrices: true,       // default: true (recommended)
});

// result.calldata   → 0x-prefixed hex string for on-chain tx
// result.params     → decoded parameters for inspection
```

### useComputedPrices

- **`true` (default)**: Computes clearing prices from execution amounts + fees. Deterministic, matches contract fee computation.
- **`false`**: Uses `solution.clearingPrices` directly (decimal strings → uint256).

## Step 5: Verify

```bash
pnpm build   # or: npx tsc -b packages/common packages/contracts packages/solver
```

```typescript
import { decodeSettleCalldata } from '@okx-intent-swap/sdk-solver';

const decoded = decodeSettleCalldata(result.calldata);
console.assert(decoded.settleId === result.params.settleId);
console.assert(decoded.tokens.length === result.params.tokens.length);
console.assert(decoded.trades.length === result.params.trades.length);
```

## Complete Example

```typescript
import {
  buildSettleCalldata,
  type SolveRequest,
  type SolveResponse,
} from '@okx-intent-swap/sdk-solver';

const request: SolveRequest = {
  auctionId: '12345',
  orders: [{
    fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    owner: '0x1234...owner',
    receiver: '0x1234...owner',
    fromTokenAmount: '1000000000',
    toTokenAmount: '500000000000000',
    validTo: 1700000000,
    appDataHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    swapMode: 'exactIn',
    partiallyFillable: false,
    signingScheme: 'eip712',
    signature: '0x...',
    commissionInfos: [{
      feePercent: '10000000',
      referrerWalletAddress: '0x...referrer',
      feeDirection: true,
      toB: false,
      commissionType: 'okx',
    }],
  }],
};

const response: SolveResponse = {
  solutions: [{
    clearingPrices: {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '1',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '2000',
    },
    orders: [{
      executedFromTokenAmount: '1000000000',
      executedToTokenAmount: '510000000000000',
      commissionInfos: [{
        feePercent: '10000000',
        referrerWalletAddress: '0x...referrer',
        feeDirection: true,
        toB: false,
        commissionType: 'okx',
      }],
      solverFeeInfo: {
        feePercent: '5000000',
        solverAddress: '0x...solver',
        feeDirection: true,
        feeAmount: '50000',
      },
    }],
    surplusFeeInfo: {
      feePercent: '9800000',
      trimReceiver: '0x...trimReceiver',
      flag: '0',
    },
  }],
};

const result = buildSettleCalldata(request, response);
console.log('Calldata:', result.calldata);
console.log('SettleId:', result.params.settleId);
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Order count mismatch` | request/solution order lengths differ | Ensure parallel arrays |
| `fromToken not found in tokens array` | Address casing mismatch | Use lowercase consistently |
| `Response contains no solutions` | Empty solutions array | Check API response format |
| TypeScript `.js` import errors | ESM requires extensions | Add `.js` to all relative imports |
