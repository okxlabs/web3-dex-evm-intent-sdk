#!/usr/bin/env npx tsx
/**
 * Build Settlement.settle() calldata and simulate on-chain.
 *
 * Prerequisites:
 *   - Node.js >= 18
 *   - pnpm install (in repo root)
 *   - pnpm build   (or: npx tsc -b packages/common packages/contracts packages/solver)
 *   - cast (foundry) installed for simulation (optional)
 *
 * Usage:
 *   npx tsx examples/encode-calldata.ts \
 *     --request  request.json \
 *     --response response.json \
 *     --interactions interactions.json \
 *     --settlement 0x1a34E1e604D8a55405172C0717B17F7631d5f265 \
 *     --from 0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596 \
 *     --rpc https://eth.api.pocket.network \
 *     --out result.json
 *
 * File formats:
 *
 *   request.json — /solve request body (full API envelope):
 *   {
 *     "auctionId": "12345",
 *     "chainIndex": "1",
 *     "settlementContract": "0x...",
 *     "orders": [{
 *       "owner": "0x...",
 *       "fromTokenAddress": "0x...",
 *       "toTokenAddress": "0x...",
 *       "fromTokenAmount": "1000000",
 *       "toTokenAmount": "500000",
 *       "validTo": "1700000000",
 *       "appDataHash": "0x...",
 *       "swapMode": "exactIn",
 *       "partiallyFillable": false,
 *       "signingScheme": "eip712",
 *       "signature": "0x...",
 *       "receiver": "0x...",
 *       "commissionInfos": [...]
 *     }],
 *     "tokens": [...],
 *     "deadline": "..."
 *   }
 *
 *   response.json — /solve response body (single solution object or wrapped in solutions[]):
 *   {
 *     "clearingPrices": { "0x...": "123", ... },
 *     "orders": [{
 *       "executedFromTokenAmount": "...",
 *       "executedToTokenAmount": "...",
 *       "commissionInfos": [...],
 *       "solverFeeInfo": { "feePercent": "0", "solverAddress": "0x...", "feeDirection": true, "feeAmount": "0" },
 *       "surplusFeeInfo": { "feePercent": "0", "trimReceiver": "0x...", "flag": "0" }
 *     }]
 *   }
 *
 *   interactions.json — 3-phase interaction array:
 *   [
 *     [],
 *     [["0xTargetAddr", "0", "0xCalldata..."], ...],
 *     []
 *   ]
 */
import {
  buildSettleCalldata,
  type SolveRequest,
  type SolveResponse,
} from '@okx-intent-swap/sdk-solver';
import type { Interaction } from '@okx-intent-swap/sdk-common';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

// ────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ────────────────────────────────────────────────────────────────────────────

function getArg(flag: string, fallback?: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  if (fallback !== undefined) return fallback;
  console.error(`Missing required argument: ${flag}`);
  process.exit(1);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf-8').match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? '');
  process.exit(0);
}

const requestFile = getArg('--request');
const responseFile = getArg('--response');
const interactionsFile = getArg('--interactions', '');
const settlementAddr = getArg('--settlement', '');
const fromAddr = getArg('--from', '');
const rpcUrl = getArg('--rpc', '');
const outFile = getArg('--out', 'settle-calldata-result.json');

// ────────────────────────────────────────────────────────────────────────────
// Parse request
// ────────────────────────────────────────────────────────────────────────────

const requestRaw = JSON.parse(fs.readFileSync(requestFile, 'utf-8'));

const request: SolveRequest = {
  auctionId: requestRaw.auctionId,
  orders: requestRaw.orders.map((o: any) => ({
    fromTokenAddress: o.fromTokenAddress,
    toTokenAddress: o.toTokenAddress,
    owner: o.owner,
    receiver: o.receiver,
    fromTokenAmount: o.fromTokenAmount,
    toTokenAmount: o.toTokenAmount,
    validTo: typeof o.validTo === 'string' ? parseInt(o.validTo, 10) : o.validTo,
    appDataHash: o.appDataHash,
    swapMode: o.swapMode,
    partiallyFillable: !!o.partiallyFillable,
    signingScheme: o.signingScheme,
    signature: o.signature,
    commissionInfos: (o.commissionInfos ?? []).map((ci: any) => ({
      feePercent: ci.feePercent,
      referrerWalletAddress: ci.referrerWalletAddress,
      feeDirection: ci.feeDirection,
      toB: ci.toB,
      commissionType: ci.commissionType,
    })),
  })),
};

// Derive settlement contract from request if not provided via CLI
const settlement = settlementAddr || requestRaw.settlementContract || '';

// ────────────────────────────────────────────────────────────────────────────
// Parse response
// ────────────────────────────────────────────────────────────────────────────

const responseRaw = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));

// Support both wrapped { solutions: [...] } and bare solution object
const solutionRaw = responseRaw.solutions
  ? responseRaw.solutions[0]
  : responseRaw;

const response: SolveResponse = {
  solutions: [
    {
      clearingPrices: solutionRaw.clearingPrices,
      orders: solutionRaw.orders.map((o: any) => ({
        executedFromTokenAmount: o.executedFromTokenAmount,
        executedToTokenAmount: o.executedToTokenAmount,
        commissionInfos: (o.commissionInfos ?? []).map((ci: any) => ({
          feePercent: ci.feePercent,
          referrerWalletAddress: ci.referrerWalletAddress,
          feeDirection: ci.feeDirection,
          toB: ci.toB,
          commissionType: ci.commissionType,
        })),
        solverFeeInfo: {
          feePercent: o.solverFeeInfo?.feePercent ?? '0',
          solverAddress: o.solverFeeInfo?.solverAddress ?? '0x0000000000000000000000000000000000000000',
          feeDirection: o.solverFeeInfo?.feeDirection ?? true,
          feeAmount: o.solverFeeInfo?.feeAmount ?? '0',
        },
      })),
      surplusFeeInfo: {
        feePercent: solutionRaw.surplusFeeInfo?.feePercent
          ?? solutionRaw.orders?.[0]?.surplusFeeInfo?.feePercent
          ?? '0',
        trimReceiver: solutionRaw.surplusFeeInfo?.trimReceiver
          ?? solutionRaw.orders?.[0]?.surplusFeeInfo?.trimReceiver
          ?? '0x0000000000000000000000000000000000000000',
        flag: solutionRaw.surplusFeeInfo?.flag
          ?? solutionRaw.orders?.[0]?.surplusFeeInfo?.flag
          ?? '0',
      },
    },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Parse interactions
// ────────────────────────────────────────────────────────────────────────────

let interactions: [Interaction[], Interaction[], Interaction[]] = [[], [], []];

if (interactionsFile) {
  const raw: string[][][] = JSON.parse(fs.readFileSync(interactionsFile, 'utf-8'));
  interactions = raw.map((phase) =>
    phase.map((item) => ({
      target: item[0],
      value: BigInt(item[1]),
      callData: item[2],
    }))
  ) as [Interaction[], Interaction[], Interaction[]];
}

// ────────────────────────────────────────────────────────────────────────────
// Build calldata
// ────────────────────────────────────────────────────────────────────────────

console.log('Building calldata...');
const result = buildSettleCalldata(request, response, {
  interactions,
  useComputedPrices: true,
});

console.log('  settleId:', result.params.settleId.toString());
console.log('  tokens:', result.params.tokens);
console.log('  clearingPrices:', result.params.clearingPrices.map(String));
console.log('  trades:', result.params.trades.length);
console.log('  calldata length:', result.calldata.length, 'chars');

// ────────────────────────────────────────────────────────────────────────────
// Simulate (optional — requires cast + --from + --rpc)
// ────────────────────────────────────────────────────────────────────────────

let simulateResult = 'skipped (provide --settlement, --from, --rpc to enable)';

if (settlement && fromAddr && rpcUrl) {
  console.log('\nSimulating on-chain...');
  console.log(`  from: ${fromAddr}`);
  console.log(`  to:   ${settlement}`);
  console.log(`  rpc:  ${rpcUrl}`);
  try {
    simulateResult = execSync(
      `cast call "${settlement}" --data "${result.calldata}" --from "${fromAddr}" --rpc-url "${rpcUrl}" 2>&1`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();
    if (!simulateResult) simulateResult = 'success (empty return)';
  } catch (e: any) {
    simulateResult = ((e.stdout || '') + (e.stderr || '')).trim();
    // Try to decode known error selectors
    const selectorMatch = simulateResult.match(/data: "0x([0-9a-f]{8})"/i);
    if (selectorMatch) {
      try {
        const decoded = execSync(
          `cast 4byte 0x${selectorMatch[1]} 2>&1`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        if (decoded) simulateResult += `\n  decoded error: ${decoded}`;
      } catch { /* ignore */ }
    }
  }
  console.log('  result:', simulateResult);
}

// ────────────────────────────────────────────────────────────────────────────
// Serialize to JSON (bigint → string)
// ────────────────────────────────────────────────────────────────────────────

const interactionsForLog = interactions.map((phase) =>
  phase.map((ix) => ({
    target: ix.target,
    value: ix.value.toString(),
    callData: ix.callData,
  }))
);

const paramsForLog = {
  settleId: result.params.settleId.toString(),
  tokens: result.params.tokens,
  clearingPrices: result.params.clearingPrices.map(String),
  tradesCount: result.params.trades.length,
  trades: result.params.trades.map((t) => ({
    fromTokenAddressIndex: t.fromTokenAddressIndex,
    toTokenAddressIndex: t.toTokenAddressIndex,
    owner: t.owner,
    receiver: t.receiver,
    fromTokenAmount: t.fromTokenAmount.toString(),
    toTokenAmount: t.toTokenAmount.toString(),
    validTo: t.validTo,
    appData: t.appData,
    flags: '0x' + t.flags.toString(16),
    executedAmount: t.executedAmount.toString(),
    commissionInfos: t.commissionInfos.map((ci) => ({
      feePercent: ci.feePercent.toString(),
      recipient: ci.recipient,
      flag: '0x' + ci.flag.toString(16),
    })),
    solverFeeInfo: {
      feePercent: t.solverFeeInfo.feePercent.toString(),
      solverAddr: t.solverFeeInfo.solverAddr,
      flag: '0x' + t.solverFeeInfo.flag.toString(16),
    },
  })),
  surplusFeeInfo: {
    feePercent: result.params.surplusFeeInfo.feePercent.toString(),
    trimReceiver: result.params.surplusFeeInfo.trimReceiver,
    flag: result.params.surplusFeeInfo.flag.toString(),
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Write output
// ────────────────────────────────────────────────────────────────────────────

const output = {
  timestamp: new Date().toISOString(),
  request,
  response,
  interactions: interactionsForLog,
  calldataParams: paramsForLog,
  calldata: result.calldata,
  simulation: {
    from: fromAddr || null,
    to: settlement || null,
    rpcUrl: rpcUrl || null,
    result: simulateResult,
  },
};

const outPath = path.resolve(outFile);
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

console.log(`\nOutput written to: ${outPath}`);
console.log('\nCalldata:');
console.log(result.calldata);
