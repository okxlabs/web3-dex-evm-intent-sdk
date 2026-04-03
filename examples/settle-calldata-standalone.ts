#!/usr/bin/env npx tsx
/**
 * Standalone script: build Settlement.settle() calldata and simulate on-chain.
 *
 * Dependency: ethers@5 (npm install ethers@5)
 * Usage:     npx tsx settle-calldata-standalone.ts
 */

import { ethers } from 'ethers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// ═══════════════════════════════════════════════════════════════════════════
// ABI (settle function only)
// ═══════════════════════════════════════════════════════════════════════════

const SETTLEMENT_ABI = [{"type":"function","name":"settle","inputs":[{"name":"settleId","type":"uint256","internalType":"uint256"},{"name":"tokens","type":"address[]","internalType":"contract IERC20[]"},{"name":"clearingPrices","type":"uint256[]","internalType":"uint256[]"},{"name":"trades","type":"tuple[]","internalType":"struct TradeLib.Data[]","components":[{"name":"fromTokenAddressIndex","type":"uint256","internalType":"uint256"},{"name":"toTokenAddressIndex","type":"uint256","internalType":"uint256"},{"name":"owner","type":"address","internalType":"address"},{"name":"receiver","type":"address","internalType":"address"},{"name":"fromTokenAmount","type":"uint256","internalType":"uint256"},{"name":"toTokenAmount","type":"uint256","internalType":"uint256"},{"name":"validTo","type":"uint32","internalType":"uint32"},{"name":"appData","type":"bytes32","internalType":"bytes32"},{"name":"flags","type":"uint256","internalType":"uint256"},{"name":"executedAmount","type":"uint256","internalType":"uint256"},{"name":"commissionInfos","type":"tuple[]","internalType":"struct OrderLib.CommissionInfo[]","components":[{"name":"feePercent","type":"uint256","internalType":"uint256"},{"name":"referrerWalletAddress","type":"address","internalType":"address"},{"name":"flag","type":"uint256","internalType":"uint256"}]},{"name":"signature","type":"bytes","internalType":"bytes"},{"name":"solverFeeInfo","type":"tuple","internalType":"struct TradeLib.SolverFeeInfo","components":[{"name":"feePercent","type":"uint256","internalType":"uint256"},{"name":"solverAddr","type":"address","internalType":"address"},{"name":"flag","type":"uint256","internalType":"uint256"}]}]},{"name":"interactions","type":"tuple[][3]","internalType":"struct InteractionLib.Data[][3]","components":[{"name":"target","type":"address","internalType":"address"},{"name":"value","type":"uint256","internalType":"uint256"},{"name":"callData","type":"bytes","internalType":"bytes"}]},{"name":"surplusFeeInfo","type":"tuple","internalType":"struct SettlementTypes.SurplusFeeInfo","components":[{"name":"feePercent","type":"uint256","internalType":"uint256"},{"name":"trimReceiver","type":"address","internalType":"address"},{"name":"flag","type":"uint256","internalType":"uint256"}]}],"outputs":[],"stateMutability":"nonpayable"}];

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const COMMISSION_DENOM = 1_000_000_000n;
const LABEL_OKX    = 1n << 248n;
const LABEL_PARENT = 1n << 247n;
const LABEL_CHILD  = 1n << 246n;
const FLAG_FROM    = 1n << 255n;
const FLAG_TO      = 1n << 254n;
const FLAG_TOB     = 1n << 253n;
const COMMISSION_TYPE_LABEL: Record<string, bigint> = { okx: LABEL_OKX, parent: LABEL_PARENT, child: LABEL_CHILD };
const SIGNING_SCHEME: Record<string, number> = { eip712: 0, ethSign: 1, eip1271: 2, preSign: 3 };

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ApiCommissionInfo { feePercent: string; referrerWalletAddress: string; feeDirection: boolean; toB: boolean; commissionType: string; }
interface ApiSolverFeeInfo { feePercent: string; solverAddress: string; feeDirection: boolean; feeAmount: string; }
interface ApiSurplusFeeInfo { feePercent: string; trimReceiver: string; flag: string; }
interface SolveRequestOrder { fromTokenAddress: string; toTokenAddress: string; owner: string; receiver: string; fromTokenAmount: string; toTokenAmount: string; validTo: number; appDataHash: string; swapMode: string; partiallyFillable: boolean; signingScheme: string; signature: string; commissionInfos: ApiCommissionInfo[]; }
interface SolveResponseOrder { executedFromTokenAmount: string; executedToTokenAmount: string; commissionInfos: ApiCommissionInfo[]; solverFeeInfo: ApiSolverFeeInfo; }
interface SolveRequest { orders: SolveRequestOrder[]; }
interface SolveResponse { solutions: { clearingPrices: Record<string, string>; orders: SolveResponseOrder[]; surplusFeeInfo: ApiSurplusFeeInfo; }[]; }
interface Interaction { target: string; value: bigint; callData: string; }

// ═══════════════════════════════════════════════════════════════════════════
// Converters
// ═══════════════════════════════════════════════════════════════════════════

function packCommissionFlag(dir: boolean, toB: boolean, type: string): bigint {
  let f = dir ? FLAG_FROM : FLAG_TO;
  if (toB) f |= FLAG_TOB;
  const label = COMMISSION_TYPE_LABEL[type];
  if (label) f |= label;
  return f;
}

function encodeTradeFlags(partiallyFillable: boolean, signingScheme: number): bigint {
  let flags = 0n;
  if (partiallyFillable) flags |= 2n;
  flags |= BigInt(signingScheme) << 5n;
  return flags;
}

function computeCustomPrices(eS: bigint, eB: bigint, cis: ApiCommissionInfo[], sf: ApiSolverFeeInfo) {
  let hasFrom = false, hasTo = false;
  for (const ci of cis) { if (BigInt(ci.feePercent) === 0n) continue; ci.feeDirection ? (hasFrom = true) : (hasTo = true); }
  if (BigInt(sf.feePercent) > 0n) { sf.feeDirection ? (hasFrom = true) : (hasTo = true); }
  if (hasFrom && hasTo) throw new Error('Mixed fee directions');
  if (!hasFrom && !hasTo) return { pSell: eB, pBuy: eS };
  if (hasFrom) {
    let fee = 0n;
    for (const ci of cis) { const p = BigInt(ci.feePercent); if (p > 0n) fee += (eS * p) / COMMISSION_DENOM; }
    const sp = BigInt(sf.feePercent); if (sp > 0n) fee += (eS * sp) / COMMISSION_DENOM;
    return { pSell: eB, pBuy: eS - fee };
  }
  let totalPct = 0n;
  for (const ci of cis) { const p = BigInt(ci.feePercent); if (p > 0n) totalPct += p; }
  const sp = BigInt(sf.feePercent); if (sp > 0n) totalPct += sp;
  let toGross = (eB * COMMISSION_DENOM) / (COMMISSION_DENOM - totalPct);
  const calcFee = (g: bigint) => { let f = 0n; for (const ci of cis) { const p = BigInt(ci.feePercent); if (p > 0n) f += (g * p) / COMMISSION_DENOM; } if (sp > 0n) f += (g * sp) / COMMISSION_DENOM; return f; };
  let fee = calcFee(toGross);
  while (toGross - fee < eB) { toGross += 1n; fee = calcFee(toGross); }
  return { pSell: toGross, pBuy: eS };
}

// ═══════════════════════════════════════════════════════════════════════════
// buildSettleCalldata
// ═══════════════════════════════════════════════════════════════════════════

function buildSettleCalldata(request: SolveRequest, response: SolveResponse, settleIdInput: string | bigint, interactions: [Interaction[], Interaction[], Interaction[]]) {
  const solution = response.solutions[0];
  if (!solution) throw new Error('No solutions');
  if (request.orders.length !== solution.orders.length) throw new Error('Order count mismatch');
  const settleId = BigInt(settleIdInput);
  const seen = new Set<string>();
  const tradeTokens: string[] = [];
  for (const o of request.orders) {
    const from = o.fromTokenAddress.toLowerCase(), to = o.toTokenAddress.toLowerCase();
    if (!seen.has(from)) { seen.add(from); tradeTokens.push(from); }
    if (!seen.has(to))   { seen.add(to);   tradeTokens.push(to);   }
  }
  const hasIx = interactions.some(p => p.length > 0);
  const offset = hasIx ? tradeTokens.length : 0;
  const tokens = hasIx ? [...tradeTokens, ...tradeTokens] : [...tradeTokens];
  const tokenIdx = new Map<string, number>();
  tradeTokens.forEach((a, i) => tokenIdx.set(a, i + offset));
  const basePrices = new Array<bigint>(tradeTokens.length).fill(0n);
  for (let i = 0; i < request.orders.length; i++) {
    const ro = request.orders[i], so = solution.orders[i];
    const fi = tradeTokens.indexOf(ro.fromTokenAddress.toLowerCase());
    const ti = tradeTokens.indexOf(ro.toTokenAddress.toLowerCase());
    const { pSell, pBuy } = computeCustomPrices(BigInt(so.executedFromTokenAmount), BigInt(so.executedToTokenAmount), so.commissionInfos, so.solverFeeInfo);
    basePrices[fi] = pSell; basePrices[ti] = pBuy;
  }
  const clearingPrices = hasIx ? [...new Array<bigint>(offset).fill(0n), ...basePrices] : basePrices;
  const trades = request.orders.map((ro, i) => {
    const so = solution.orders[i];
    return {
      fromTokenAddressIndex: tokenIdx.get(ro.fromTokenAddress.toLowerCase())!,
      toTokenAddressIndex: tokenIdx.get(ro.toTokenAddress.toLowerCase())!,
      owner: ro.owner, receiver: ro.receiver,
      fromTokenAmount: BigInt(ro.fromTokenAmount), toTokenAmount: BigInt(ro.toTokenAmount),
      validTo: ro.validTo, appData: ro.appDataHash,
      flags: encodeTradeFlags(ro.partiallyFillable, SIGNING_SCHEME[ro.signingScheme] ?? 0),
      executedAmount: ro.swapMode === 'exactIn' ? BigInt(so.executedFromTokenAmount) : BigInt(so.executedToTokenAmount),
      commissionInfos: so.commissionInfos.map(ci => ({ feePercent: BigInt(ci.feePercent), referrerWalletAddress: ci.referrerWalletAddress, flag: packCommissionFlag(ci.feeDirection, ci.toB, ci.commissionType) })),
      signature: ro.signature,
      solverFeeInfo: { feePercent: BigInt(so.solverFeeInfo.feePercent), solverAddr: so.solverFeeInfo.solverAddress, flag: so.solverFeeInfo.feeDirection ? FLAG_FROM : FLAG_TO },
    };
  }).sort((a, b) => a.toTokenAddressIndex - b.toTokenAddressIndex);
  const surplusFeeInfo = { feePercent: BigInt(solution.surplusFeeInfo.feePercent), trimReceiver: solution.surplusFeeInfo.trimReceiver, flag: BigInt(solution.surplusFeeInfo.flag) };
  const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
  const calldata = iface.encodeFunctionData('settle', [
    settleId.toString(), tokens, clearingPrices.map(p => p.toString()),
    trades.map(t => ({ ...t, fromTokenAmount: t.fromTokenAmount.toString(), toTokenAmount: t.toTokenAmount.toString(), flags: t.flags.toString(), executedAmount: t.executedAmount.toString(), commissionInfos: t.commissionInfos.map(ci => ({ feePercent: ci.feePercent.toString(), referrerWalletAddress: ci.referrerWalletAddress, flag: ci.flag.toString() })), solverFeeInfo: { feePercent: t.solverFeeInfo.feePercent.toString(), solverAddr: t.solverFeeInfo.solverAddr, flag: t.solverFeeInfo.flag.toString() } })),
    interactions.map(phase => phase.map(ix => ({ target: ix.target, value: ix.value.toString(), callData: ix.callData }))),
    { feePercent: surplusFeeInfo.feePercent.toString(), trimReceiver: surplusFeeInfo.trimReceiver, flag: surplusFeeInfo.flag.toString() },
  ]);
  return { calldata, settleId, tokens, clearingPrices, trades, surplusFeeInfo };
}

// ═══════════════════════════════════════════════════════════════════════════
// Inline data — modify these to test with different data
// ═══════════════════════════════════════════════════════════════════════════

const SETTLEMENT = '0x1a34E1e604D8a55405172C0717B17F7631d5f265';
const FROM_ADDR  = '0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596';
const RPC_URL    = 'https://eth.api.pocket.network';

const settleId = '16991079005141248';

const request: SolveRequest = {
  orders: [{
    fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    toTokenAddress:   '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    owner:    '0xd83be9aba0c6a872056fa6871df59e4ed1485d62',
    receiver: '0xd83be9aba0c6a872056fa6871df59e4ed1485d62',
    fromTokenAmount: '1000000000000000',
    toTokenAmount:   '2093157',
    validTo: 1774258453,
    appDataHash: '0xb44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce',
    swapMode: 'exactIn',
    partiallyFillable: false,
    signingScheme: 'eip712',
    signature: '0x79f1f8cbeb98dffe7b0f67da9cfd62d8d9523ff011408eab4891637cb57c5a516fa8f52a2d4ebbde0e1d1ce0c05d7851abfa449da0e26e46cfaa7a5dc560c0041b',
    commissionInfos: [
      { referrerWalletAddress: '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d', feePercent: '3000000', toB: false, feeDirection: true, commissionType: 'okx' },
      { referrerWalletAddress: '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7', feePercent: '1000000', toB: false, feeDirection: true, commissionType: 'child' },
      { referrerWalletAddress: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742', feePercent: '5000000', toB: false, feeDirection: true, commissionType: 'parent' },
    ],
  }],
};

const response: SolveResponse = {
  solutions: [{
    clearingPrices: {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '1000645259030788013',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '2135771925151105278976',
    },
    orders: [{
      executedFromTokenAmount: '982022215514000',
      executedToTokenAmount:   '2096023',
      commissionInfos: [
        { toB: false, feePercent: '3000000', feeDirection: true, commissionType: 'okx',    referrerWalletAddress: '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d' },
        { toB: false, feePercent: '1000000', feeDirection: true, commissionType: 'child',  referrerWalletAddress: '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7' },
        { toB: false, feePercent: '5000000', feeDirection: true, commissionType: 'parent', referrerWalletAddress: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742' },
      ],
      solverFeeInfo: { feePercent: '0', solverAddress: '0x2c0552e5dcb79b064fd23e358a86810bc5994244', feeDirection: true, feeAmount: '8977784486000' },
    }],
    surplusFeeInfo: { feePercent: '0', trimReceiver: '0x2c0552e5dcb79b064fd23e358a86810bc5994244', flag: '0' },
  }],
};

const interactions: [Interaction[], Interaction[], Interaction[]] = [
  [],
  [{ target: '0x179dC3fb0F2230094894317f307241A52CdB38Aa', value: 0n, callData: '0xf0d7bb940000000000000000000000002c0552e5dcb79b064fd23e358a86810bc599424400000000000000000000000000000000000000000000000000037d24dd51379000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000019d0ad2c60700000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000009800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000001fa9b60000000000000000000000001a34e1e604d8a55405172c0717b17f7631d5f2650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000000000000000000000000000001a34e1e604d8a55405172c0717b17f7631d5f2650000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000003e0000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000bbbbbbb520d69a9775e85b458c58c648259fad5f00000000000000000000000000000000000000000000000000000000000000800002000001a4000000000000bbbbbbb520d69a9775e85b458c58c648259fad5f00000000000000000000000000000000000000000000000000000000000002644dcebcba0000000000000000000000000000000000000000000000000000000069bd23a40000000000000000000000002c0552e5dcb79b064fd23e358a86810bc5994244000000000000000000000000b7131fc8cdc43060a6210257f537dba5fcae6aed0000000000000000000000000000000000000000000000002ece9a03db4cef3b000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000fa1c09fc8b491b6a4d3ff53a10cad29381b3f94900000000000000000000000000000000000000000000000000038d7ea4c68000000000000000000000000000000000000000000000000001a1a30e59ef97e8420000000000000000000000002c0552e5dcb79b064fd23e358a86810bc59942440000000000000000000000000000000000000000000000000000000000000000e6fb1069c16443008b52f8ca5c12cb7c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000041233a696f94c7c0c4e92457ca6838a1eed0aedca62f462e2da590de53d31f0ad8468aaf6557919bf517e8adf842ee7bc086822366edf5db5cdfda37d3016aa2eb1b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000fa1c09fc8b491b6a4d3ff53a10cad29381b3f9490000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000bbbbbbb520d69a9775e85b458c58c648259fad5f00000000000000000000000000000000000000000000000000000000000000800002000001a4000000000000bbbbbbb520d69a9775e85b458c58c648259fad5f00000000000000000000000000000000000000000000000000000000000002644dcebcba0000000000000000000000000000000000000000000000000000000069bd23a50000000000000000000000002c0552e5dcb79b064fd23e358a86810bc5994244000000000000000000000000bee3211ab312a8d065c4fef0247448e17a8da00000000000000000000000000000000000000000000000000027de3ea950a2bed1000000000000000000000000fa1c09fc8b491b6a4d3ff53a10cad29381b3f949000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000001a19e28a711b3f9d0000000000000000000000000000000000000000000000000000000000020917c0000000000000000000000002c0552e5dcb79b064fd23e358a86810bc599424400000000000000000000000000000000000000000000000000000000000000001fc5d640cf1b77f183c801d21e740cc80000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000410b3282f4431da099d015a9c382e071f90ac13447888b9c550968d11497b15335024d3e1085229ee39226d4928e3fdd3c0800138aef9dcd8081d0402f9a6753931b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' }],
  [],
];

// ═══════════════════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== Building Settlement.settle() Calldata ===\n');
const result = buildSettleCalldata(request, response, settleId, interactions);

console.log('settleId:', result.settleId.toString());
console.log('tokens:', result.tokens);
console.log('clearingPrices:', result.clearingPrices.map(String));
console.log('trades:', result.trades.length);

console.log('\n=== Calldata ===\n');
console.log(result.calldata);

console.log('\n=== Simulating on-chain ===\n');
console.log(`from: ${FROM_ADDR}`);
console.log(`to:   ${SETTLEMENT}`);
console.log(`rpc:  ${RPC_URL}`);

let simulateResult: string;
try {
  simulateResult = execSync(`cast call "${SETTLEMENT}" --data "${result.calldata}" --from "${FROM_ADDR}" --rpc-url "${RPC_URL}" 2>&1`, { encoding: 'utf-8', timeout: 30000 }).trim();
  if (!simulateResult) simulateResult = 'success (empty return)';
} catch (e: any) {
  simulateResult = ((e.stdout || '') + (e.stderr || '')).trim();
  const m = simulateResult.match(/data: "0x([0-9a-f]{8})"/i);
  if (m) { try { simulateResult += '\n  decoded: ' + execSync(`cast 4byte 0x${m[1]} 2>&1`, { encoding: 'utf-8', timeout: 5000 }).trim(); } catch {} }
}
console.log('result:', simulateResult);

// ── Write output JSON ──
const jsonSafe = (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v;
const output = {
  timestamp: new Date().toISOString(),
  request, response,
  interactions: interactions.map(p => p.map(ix => ({ target: ix.target, value: ix.value.toString(), callData: ix.callData }))),
  settleParams: { settleId: result.settleId.toString(), tokens: result.tokens, clearingPrices: result.clearingPrices.map(String), trades: result.trades, surplusFeeInfo: result.surplusFeeInfo },
  calldata: result.calldata,
  simulation: { from: FROM_ADDR, to: SETTLEMENT, rpcUrl: RPC_URL, result: simulateResult },
};
const outPath = path.resolve('settle-calldata-result.json');
fs.writeFileSync(outPath, JSON.stringify(output, jsonSafe, 2), 'utf-8');
console.log(`\nOutput written to: ${outPath}`);
