/**
 * Debug script: encode then decode to compare orderUid with expected.
 */
import {
  buildSettleCalldata,
  decodeSettleCalldata,
  type SolveRequest,
  type SolveResponse,
} from '@okx-intent-swap/sdk-solver';
import type { Interaction } from '@okx-intent-swap/sdk-common';
import * as fs from 'node:fs';

// ── Request ──
const request: SolveRequest = {
  auctionId: '16991078998390016',
  orders: [
    {
      fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      toTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      owner: '0xd83be9aba0c6a872056fa6871df59e4ed1485d62',
      receiver: '0xd83be9aba0c6a872056fa6871df59e4ed1485d62',
      fromTokenAmount: '1000000000000000',
      toTokenAmount: '2093157',
      validTo: 1774258453,
      appDataHash: '0xb44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce',
      swapMode: 'exactIn',
      partiallyFillable: false,
      signingScheme: 'eip712',
      signature:
        '0x79f1f8cbeb98dffe7b0f67da9cfd62d8d9523ff011408eab4891637cb57c5a516fa8f52a2d4ebbde0e1d1ce0c05d7851abfa449da0e26e46cfaa7a5dc560c0041b',
      commissionInfos: [
        {
          referrerWalletAddress: '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d',
          feePercent: '3000000',
          toB: false,
          feeDirection: true,
          commissionType: 'okx',
        },
        {
          referrerWalletAddress: '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7',
          feePercent: '1000000',
          toB: false,
          feeDirection: true,
          commissionType: 'child',
        },
        {
          referrerWalletAddress: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
          feePercent: '5000000',
          toB: false,
          feeDirection: true,
          commissionType: 'parent',
        },
      ],
    },
  ],
};

// ── Response ──
const solutionRaw = JSON.parse(
  fs.readFileSync('/Users/comcatli/Downloads/solution.json', 'utf-8')
);
const response: SolveResponse = {
  solutions: [
    {
      clearingPrices: solutionRaw.clearingPrices,
      orders: solutionRaw.orders.map((o: any) => ({
        executedFromTokenAmount: o.executedFromTokenAmount,
        executedToTokenAmount: o.executedToTokenAmount,
        commissionInfos: o.commissionInfos,
        solverFeeInfo: o.solverFeeInfo,
      })),
      surplusFeeInfo: {
        feePercent: solutionRaw.orders[0].surplusFeeInfo?.feePercent ?? '0',
        trimReceiver: solutionRaw.orders[0].surplusFeeInfo?.trimReceiver ?? '0x0000000000000000000000000000000000000000',
        flag: solutionRaw.orders[0].surplusFeeInfo?.flag ?? '0',
      },
    },
  ],
};

// ── Interactions ──
const interactionsRaw: string[][][] = JSON.parse(
  fs.readFileSync('/Users/comcatli/Downloads/interactions', 'utf-8')
);
const interactions: [Interaction[], Interaction[], Interaction[]] = interactionsRaw.map(
  (phase) =>
    phase.map((item) => ({
      target: item[0],
      value: BigInt(item[1]),
      callData: item[2],
    }))
) as [Interaction[], Interaction[], Interaction[]];

// ── Build ──
const result = buildSettleCalldata(request, response, {
  interactions,
  useComputedPrices: true,
});

// ── Decode ──
const decoded = decodeSettleCalldata(result.calldata);

console.log('=== Decoded settle() params ===');
console.log('settleId:', decoded.settleId.toString());
console.log('tokens:', decoded.tokens);
console.log('clearingPrices:', decoded.clearingPrices.map(String));

const trade = decoded.trades[0];
console.log('\n=== Trade 0 ===');
console.log('fromTokenAddressIndex:', trade.fromTokenAddressIndex);
console.log('toTokenAddressIndex:', trade.toTokenAddressIndex);
console.log('owner:', trade.owner);
console.log('receiver:', trade.receiver);
console.log('fromTokenAmount:', trade.fromTokenAmount.toString());
console.log('toTokenAmount:', trade.toTokenAmount.toString());
console.log('validTo:', trade.validTo);
console.log('appData:', trade.appData);
console.log('flags:', '0x' + trade.flags.toString(16));
console.log('executedAmount:', trade.executedAmount.toString());

// OrderUid from params (pre-encoding)
const paramsTrade = result.params.trades[0];
console.log('\n=== OrderUid from params ===');
console.log('orderUid:', paramsTrade.orderUid);

// Compare with expected
const expectedUid = '0x094c4d35911cea667cfe3c58ca0d359ae52cd2668eaf13fbe966263cd35c5bb0d83be9aba0c6a872056fa6871df59e4ed1485d6269c10915';
console.log('\n=== OrderUid Comparison ===');
console.log('expected:', expectedUid);
console.log('actual:  ', paramsTrade.orderUid);
console.log('match:', expectedUid.toLowerCase() === paramsTrade.orderUid.toLowerCase());

if (expectedUid.toLowerCase() !== paramsTrade.orderUid.toLowerCase()) {
  // Digest (first 32 bytes → chars 2..66)
  console.log('\ndigest expected:', expectedUid.slice(0, 66));
  console.log('digest actual:  ', paramsTrade.orderUid.slice(0, 66));

  // Owner (bytes 32-51 → chars 66..106)
  console.log('owner expected: ', '0x' + expectedUid.slice(66, 106));
  console.log('owner actual:   ', '0x' + paramsTrade.orderUid.slice(66, 106));

  // ValidTo (bytes 52-55 → chars 106..114)
  console.log('validTo expected:', parseInt(expectedUid.slice(106, 114), 16));
  console.log('validTo actual:  ', parseInt(paramsTrade.orderUid.slice(106, 114), 16));
}

// CommissionInfos
console.log('\n=== CommissionInfos ===');
for (const ci of trade.commissionInfos) {
  console.log({
    recipient: ci.recipient,
    feePercent: ci.feePercent.toString(),
    flag: '0x' + ci.flag.toString(16),
  });
}

// SolverFeeInfo
console.log('\n=== SolverFeeInfo ===');
console.log(trade.solverFeeInfo);

// SurplusFeeInfo
console.log('\n=== SurplusFeeInfo ===');
console.log({
  trimReceiver: decoded.surplusFeeInfo.trimReceiver,
  feePercent: decoded.surplusFeeInfo.feePercent.toString(),
  flag: decoded.surplusFeeInfo.flag.toString(),
});

console.log('\n=== Interactions ===');
for (let phase = 0; phase < 3; phase++) {
  const label = ['pre', 'swap', 'post'][phase];
  console.log(`${label}: ${decoded.interactions[phase].length} interaction(s)`);
}
