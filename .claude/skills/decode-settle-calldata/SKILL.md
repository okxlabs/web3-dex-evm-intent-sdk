---
name: decode-settle-calldata
description: Decode hex-encoded Settlement.settle() calldata into readable fields or reconstruct original /solve request and response
user-invocable: true
argument-hint: [calldata-hex]
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Decode Settlement Calldata

Decode hex-encoded `Settlement.settle()` calldata into readable fields, or fully reconstruct the original `/solve` request and response.

If `$ARGUMENTS` is a `0x`-prefixed hex string, decode it and display the results. If empty or "help", explain both decoding levels.

## Two Decoding Levels

| Level | Function | Output |
|-------|----------|--------|
| 1 | `decodeSettleCalldata()` | Raw on-chain types (`Trade`, `bigint` flags) |
| 2 | `reconstructFromCalldata()` | API-level types (`SolveRequest`, `SolveResponse`) |

## Level 1: decodeSettleCalldata

Direct ABI decode with no interpretation.

```typescript
import { decodeSettleCalldata } from '@okx-intent-swap/sdk-solver';

const decoded = decodeSettleCalldata('0x...');
// {
//   settleId: bigint,
//   tokens: string[],                // checksummed addresses
//   clearingPrices: bigint[],        // parallel to tokens[]
//   trades: Trade[],                 // on-chain struct format
//   interactions: [Interaction[], Interaction[], Interaction[]],
//   surplusFeeInfo: { feePercent: bigint, trimReceiver: string, flag: bigint }
// }
```

### Inspecting Decoded Fields

```typescript
console.log('Settle ID:', decoded.settleId);
console.log('Tokens:', decoded.tokens);
console.log('Clearing Prices:', decoded.clearingPrices.map(String));

for (const trade of decoded.trades) {
  console.log('---');
  console.log('From token index:', trade.fromTokenAddressIndex);
  console.log('To token index:', trade.toTokenAddressIndex);
  console.log('Owner:', trade.owner);
  console.log('Receiver:', trade.receiver);  // address(0) = same as owner
  console.log('From amount:', trade.fromTokenAmount);
  console.log('To amount:', trade.toTokenAmount);
  console.log('Executed amount:', trade.executedAmount);
  console.log('Flags:', trade.flags);
  console.log('Commission count:', trade.commissionInfos.length);
  console.log('Solver fee %:', trade.solverFeeInfo.feePercent);
}
```

## Flag Unpacking

### Commission Info Flags

Packed `uint256` bitmask layout:

```
bit 255: FROM_TOKEN_COMMISSION (feeDirection = true)
bit 254: TO_TOKEN_COMMISSION   (feeDirection = false)
bit 253: IS_TO_B               (toB = true)
bit 248: LABEL_OKX             (commissionType = "okx")
bit 247: LABEL_PARENT          (commissionType = "parent")
bit 246: LABEL_CHILD           (commissionType = "child")
```

```typescript
import { unpackCommissionFlag } from '@okx-intent-swap/sdk-solver';

for (const ci of trade.commissionInfos) {
  const { feeDirection, toB, commissionType } = unpackCommissionFlag(ci.flag);
  console.log({ feePercent: ci.feePercent, feeDirection, toB, commissionType });
}
```

### Solver Fee Flags

```typescript
import { unpackSolverFeeFlag } from '@okx-intent-swap/sdk-solver';

const feeDirection = unpackSolverFeeFlag(trade.solverFeeInfo.flag);
// true = fromToken, false = toToken
```

### Trade Flags

```
bit 0:    reserved (exactIn = 0)
bit 1:    partiallyFillable (1 = partial, 0 = fill-or-kill)
bits 5-6: signingScheme (0=eip712, 1=ethSign, 2=eip1271, 3=preSign)
```

```typescript
import { decodeTradeFlags } from '@okx-intent-swap/sdk-common';

const { swapMode, partiallyFillable, signingScheme } = decodeTradeFlags(trade.flags);
```

## Level 2: reconstructFromCalldata

Unpacks flags, decodes trade flags, recovers executed amounts, restores `SolveRequest` / `SolveResponse`.

```typescript
import { reconstructFromCalldata } from '@okx-intent-swap/sdk-solver';

const { settleId, request, response, interactions } = reconstructFromCalldata('0x...');
// settleId: bigint — the on-chain settle ID (distinct from auctionId)
// request.auctionId is undefined — cannot be recovered from calldata
```

### Recovery Details

| Field | Method |
|-------|--------|
| `auctionId` | Not recoverable from calldata (only settleId is encoded on-chain) |
| `fromTokenAddress` / `toTokenAddress` | `tokens[trade.fromTokenAddressIndex]` |
| `receiver` | `address(0)` restored to `owner` |
| `swapMode`, `partiallyFillable`, `signingScheme` | Decoded from `trade.flags` |
| `commissionInfos` | Unpacked via `unpackCommissionFlag()` |
| `solverFeeInfo.feeDirection` | Unpacked via `unpackSolverFeeFlag()` |
| `executedFromTokenAmount` / `executedToTokenAmount` | Computed from clearing prices + fees |

### Executed Amount Recovery

For `exactIn` (`executedAmount = eS`):
- **fromToken fees / no fees**: `eB = clearingPrices[fromTokenIndex]`
- **toToken fees**: `toGross = clearingPrices[fromTokenIndex]`, `eB = toGross - totalToTokenFee`

For `exactOut` (`executedAmount = eB`):
- **toToken fees / no fees**: `eS = clearingPrices[toTokenIndex]`
- **fromToken fees**: Reverse-computed from fee percentages

### Limitations

1. Assumes `useComputedPrices=true` (SDK default)
2. Clearing prices are on-chain uint256 values, not original decimal strings
3. `solverFeeInfo.feeAmount` is recomputed (not stored on-chain)
4. Addresses are checksummed (ethers decode). Compare with `.toLowerCase()`

## Complete Example

```typescript
import {
  decodeSettleCalldata,
  reconstructFromCalldata,
  unpackCommissionFlag,
  unpackSolverFeeFlag,
} from '@okx-intent-swap/sdk-solver';
import { decodeTradeFlags } from '@okx-intent-swap/sdk-common';

const calldata = '0x...';

// Level 1
const decoded = decodeSettleCalldata(calldata);
console.log('Settle ID:', decoded.settleId.toString());

for (let i = 0; i < decoded.trades.length; i++) {
  const trade = decoded.trades[i];
  const { swapMode, partiallyFillable, signingScheme } = decodeTradeFlags(trade.flags);
  console.log(`Trade ${i}: mode=${swapMode}, partial=${partiallyFillable}`);

  for (const ci of trade.commissionInfos) {
    const unpacked = unpackCommissionFlag(ci.flag);
    console.log(`  Commission: ${ci.feePercent} (${unpacked.commissionType})`);
  }
}

// Level 2
const { settleId, request, response, interactions } = reconstructFromCalldata(calldata);
console.log('Settle ID:', settleId.toString());

for (let i = 0; i < request.orders.length; i++) {
  const resOrder = response.solutions[0].orders[i];
  console.log(`Order ${i}: executed ${resOrder.executedFromTokenAmount} → ${resOrder.executedToTokenAmount}`);
}
```
