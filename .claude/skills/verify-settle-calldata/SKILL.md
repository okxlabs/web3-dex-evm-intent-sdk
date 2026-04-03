---
name: verify-settle-calldata
description: Verify calldata correctness via round-trip encode-decode-re-encode comparison with field-level mismatch report
user-invocable: true
argument-hint: [calldata-hex]
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Verify Settlement Calldata

Verify hex-encoded calldata via round-trip comparison: decode → reconstruct → re-encode → compare.

If `$ARGUMENTS` is a `0x`-prefixed hex string, run the full verification pipeline and output a match/mismatch report. If empty or "help", explain the workflow.

## Verification Pipeline

```
original calldata
  → reconstructFromCalldata()  → { settleId, request, response, interactions }
  → buildSettleCalldata()      → re-encoded calldata
  → compare original vs re-encoded
```

## Step 1: Decode and Reconstruct

```typescript
import {
  reconstructFromCalldata,
  buildSettleCalldata,
  decodeSettleCalldata,
} from '@okx-intent-swap/sdk-solver';

const originalCalldata = '0x...';

const { settleId, request, response, interactions } = reconstructFromCalldata(originalCalldata);
```

## Step 2: Re-Encode

```typescript
const reEncoded = buildSettleCalldata(request, response, settleId, {
  interactions,
  useComputedPrices: true,
});
```

## Step 3: Byte-Level Comparison

```typescript
const match = originalCalldata.toLowerCase() === reEncoded.calldata.toLowerCase();
console.log('Round-trip match:', match ? 'PASS' : 'FAIL');
```

## Step 4: Field-Level Diff (on mismatch)

When byte comparison fails, decode both and compare field-by-field:

```typescript
const original = decodeSettleCalldata(originalCalldata);
const rebuilt = decodeSettleCalldata(reEncoded.calldata);
const report: string[] = [];

// settleId
if (original.settleId !== rebuilt.settleId)
  report.push(`settleId: ${original.settleId} !== ${rebuilt.settleId}`);

// tokens (case-insensitive)
if (original.tokens.length !== rebuilt.tokens.length) {
  report.push(`tokens.length: ${original.tokens.length} !== ${rebuilt.tokens.length}`);
} else {
  original.tokens.forEach((t, i) => {
    if (t.toLowerCase() !== rebuilt.tokens[i].toLowerCase())
      report.push(`tokens[${i}]: ${t} !== ${rebuilt.tokens[i]}`);
  });
}

// clearingPrices
if (original.clearingPrices.length !== rebuilt.clearingPrices.length) {
  report.push(`clearingPrices.length mismatch`);
} else {
  original.clearingPrices.forEach((p, i) => {
    if (p !== rebuilt.clearingPrices[i])
      report.push(`clearingPrices[${i}]: ${p} !== ${rebuilt.clearingPrices[i]}`);
  });
}

// trades
if (original.trades.length !== rebuilt.trades.length) {
  report.push(`trades.length: ${original.trades.length} !== ${rebuilt.trades.length}`);
} else {
  original.trades.forEach((ot, i) => {
    const rt = rebuilt.trades[i];
    const fields: [string, unknown, unknown][] = [
      ['fromTokenAddressIndex', ot.fromTokenAddressIndex, rt.fromTokenAddressIndex],
      ['toTokenAddressIndex', ot.toTokenAddressIndex, rt.toTokenAddressIndex],
      ['fromTokenAmount', ot.fromTokenAmount, rt.fromTokenAmount],
      ['toTokenAmount', ot.toTokenAmount, rt.toTokenAmount],
      ['validTo', ot.validTo, rt.validTo],
      ['appData', ot.appData, rt.appData],
      ['flags', ot.flags, rt.flags],
      ['executedAmount', ot.executedAmount, rt.executedAmount],
      ['signature', ot.signature, rt.signature],
    ];
    for (const [name, a, b] of fields) {
      if (a !== b) report.push(`trades[${i}].${name}: ${a} !== ${b}`);
    }
    // addresses (case-insensitive)
    if (ot.owner.toLowerCase() !== rt.owner.toLowerCase())
      report.push(`trades[${i}].owner mismatch`);
    if (ot.receiver.toLowerCase() !== rt.receiver.toLowerCase())
      report.push(`trades[${i}].receiver mismatch`);

    // commissionInfos
    if (ot.commissionInfos.length !== rt.commissionInfos.length) {
      report.push(`trades[${i}].commissionInfos.length mismatch`);
    } else {
      ot.commissionInfos.forEach((oc, j) => {
        const rc = rt.commissionInfos[j];
        if (oc.feePercent !== rc.feePercent)
          report.push(`trades[${i}].commissionInfos[${j}].feePercent: ${oc.feePercent} !== ${rc.feePercent}`);
        if (oc.referrerWalletAddress.toLowerCase() !== rc.referrerWalletAddress.toLowerCase())
          report.push(`trades[${i}].commissionInfos[${j}].referrerWalletAddress mismatch`);
        if (oc.flag !== rc.flag)
          report.push(`trades[${i}].commissionInfos[${j}].flag: ${oc.flag} !== ${rc.flag}`);
      });
    }

    // solverFeeInfo
    if (ot.solverFeeInfo.feePercent !== rt.solverFeeInfo.feePercent)
      report.push(`trades[${i}].solverFeeInfo.feePercent mismatch`);
    if (ot.solverFeeInfo.solverAddr.toLowerCase() !== rt.solverFeeInfo.solverAddr.toLowerCase())
      report.push(`trades[${i}].solverFeeInfo.solverAddr mismatch`);
    if (ot.solverFeeInfo.flag !== rt.solverFeeInfo.flag)
      report.push(`trades[${i}].solverFeeInfo.flag mismatch`);
  });
}

// interactions
for (let phase = 0; phase < 3; phase++) {
  const op = original.interactions[phase];
  const rp = rebuilt.interactions[phase];
  if (op.length !== rp.length) {
    report.push(`interactions[${phase}].length: ${op.length} !== ${rp.length}`);
  } else {
    op.forEach((o, j) => {
      if (o.target.toLowerCase() !== rp[j].target.toLowerCase())
        report.push(`interactions[${phase}][${j}].target mismatch`);
      if (o.value !== rp[j].value)
        report.push(`interactions[${phase}][${j}].value mismatch`);
      if (o.callData !== rp[j].callData)
        report.push(`interactions[${phase}][${j}].callData mismatch`);
    });
  }
}

// surplusFeeInfo
if (original.surplusFeeInfo.feePercent !== rebuilt.surplusFeeInfo.feePercent)
  report.push(`surplusFeeInfo.feePercent mismatch`);
if (original.surplusFeeInfo.trimReceiver.toLowerCase() !== rebuilt.surplusFeeInfo.trimReceiver.toLowerCase())
  report.push(`surplusFeeInfo.trimReceiver mismatch`);
if (original.surplusFeeInfo.flag !== rebuilt.surplusFeeInfo.flag)
  report.push(`surplusFeeInfo.flag mismatch`);

// Report
if (report.length === 0) {
  console.log('VERIFICATION PASSED: All fields match');
} else {
  console.log(`VERIFICATION FAILED: ${report.length} mismatches`);
  report.forEach(line => console.log(`  - ${line}`));
}
```

## Common Mismatch Causes

| Field | Cause | Fix |
|-------|-------|-----|
| `clearingPrices` | Original used `useComputedPrices=false` | Re-encode with `useComputedPrices=false` |
| `tokens` | Checksum vs lowercase | Compare with `.toLowerCase()` |
| `executedAmount` | Fee rounding | Check fee direction and precision |
| `trades` order | Sort order | SDK sorts by `toTokenAddressIndex` ascending |
| `receiver` | `address(0)` vs actual | `address(0)` means receiver === owner |
| `interactions` | Missing calldata | Must pass interactions explicitly |

## Complete Verification Function

```typescript
import {
  reconstructFromCalldata,
  buildSettleCalldata,
  decodeSettleCalldata,
} from '@okx-intent-swap/sdk-solver';

function verifyCalldata(calldata: string): void {
  console.log('=== Calldata Verification ===\n');
  console.log(`Input: ${(calldata.length - 2) / 2} bytes\n`);

  const { settleId, request, response, interactions } = reconstructFromCalldata(calldata);
  console.log(`Reconstructed: settleId=${settleId}, orders=${request.orders.length}`);

  const reEncoded = buildSettleCalldata(request, response, settleId, {
    interactions,
    useComputedPrices: true,
  });

  const bytesMatch = calldata.toLowerCase() === reEncoded.calldata.toLowerCase();
  console.log(`\nByte-level match: ${bytesMatch ? 'PASS' : 'FAIL'}`);

  if (!bytesMatch) {
    const a = calldata.toLowerCase();
    const b = reEncoded.calldata.toLowerCase();
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`First diff at byte ${Math.floor((i - 2) / 2)}`);
        break;
      }
    }
  }
}

verifyCalldata('0x...');
```
