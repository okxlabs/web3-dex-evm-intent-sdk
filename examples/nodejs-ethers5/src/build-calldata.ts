/**
 * Example: Build Settlement.settle() calldata from Solver API request/response.
 *
 * Demonstrates how to transform raw /solve API JSON into SDK types
 * and produce ABI-encoded calldata ready for on-chain submission.
 *
 * Usage:
 *   pnpm build && node dist/build-calldata.js
 */

import {
  buildSettleCalldata,
  type SolveRequest,
  type SolveResponse,
} from '@okx-intent-swap/sdk';

// ============ Raw API Input (as received from /solve endpoint) ============

/**
 * Raw /solve request body — contains fields beyond what the SDK needs.
 * Fields like chainIndex, deadline, tokens, settlementContract, orderUid,
 * createTime are used by the API but not required for calldata encoding.
 */
const rawRequest = {
  chainIndex: 1,
  auctionId: '16888616559291392',
  deadline: 1772435845666,
  orders: [
    {
      orderUid:
        '0x7651e48dfb187bfcd85c193a3fd4d044defdaa2cfdb48aff90b1b5d28885f0ec3474fbbc6e43dcb0398e2eacbe1032cced80674269a92d34',
      owner: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
      fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      toTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      fromTokenAmount: '2000000000000000',
      toTokenAmount: '3827335',
      swapMode: 'exactIn',
      partiallyFillable: false,
      validTo: 1772694836,
      appDataHash: '0xb44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce',
      signature:
        '0x0fce841f6acd0ae9d16b621bc19b4f8424764278573f3cf026463b9a30ac46d34b44addf867e5f53dd342daaaf5a2ca26af56da42d40f2d2e99e58213f93f4f71c',
      signingScheme: 'eip712',
      receiver: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
      createTime: 1772435638,
      commissionInfos: [
        {
          feePercent: '3000000',
          feeAmount: null,
          referrerWalletAddress: '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d',
          commissionType: 'okx',
          feeDirection: true,
          toB: false,
        },
        {
          feePercent: '1000000',
          feeAmount: null,
          referrerWalletAddress: '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7',
          commissionType: 'child',
          feeDirection: true,
          toB: false,
        },
        {
          feePercent: '500000',
          feeAmount: null,
          referrerWalletAddress: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
          commissionType: 'parent',
          feeDirection: true,
          toB: false,
        },
      ],
    },
  ],
  tokens: [
    { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', price: '3980.317435057675563497' },
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', price: '1' },
  ],
  settlementContract: '0x1a34e1e604d8a55405172c0717b17f7631d5f265',
};

/**
 * Raw /solve response body — wrapped in { code, msg, data } envelope.
 * surplusFeeInfo is at the solution level (not per-order).
 */
const rawResponse = {
  code: 0,
  msg: 'success',
  data: {
    solutions: [
      {
        solutionId: '1',
        submissionAddress: '0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596',
        orders: [
          {
            orderUid:
              '0x7651e48dfb187bfcd85c193a3fd4d044defdaa2cfdb48aff90b1b5d28885f0ec3474fbbc6e43dcb0398e2eacbe1032cced80674269a92d34',
            swapMode: 'exactIn',
            fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            toTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            fromTokenAmount: '2000000000000000',
            toTokenAmount: '3827335',
            executedFromTokenAmount: '2000000000000000',
            executedToTokenAmount: '3860897',
            solverFeeInfo: {
              feePercent: '0',
              feeAmount: '0',
              solverAddress: '0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596',
              feeDirection: true,
            },
            commissionInfos: [
              {
                feePercent: '3000000',
                feeAmount: '6000000000000',
                referrerWalletAddress: '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d',
                commissionType: 'okx',
                feeDirection: true,
                toB: false,
              },
              {
                feePercent: '1000000',
                feeAmount: '2000000000000',
                referrerWalletAddress: '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7',
                commissionType: 'child',
                feeDirection: true,
                toB: false,
              },
              {
                feePercent: '500000',
                feeAmount: '1000000000000',
                referrerWalletAddress: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
                commissionType: 'parent',
                feeDirection: true,
                toB: false,
              },
            ],
          },
        ],
        clearingPrices: {
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '0.000000001939175082119537920642893019',
          '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '1',
        },
        surplusFeeInfo: {
          feePercent: '0',
          trimReceiver: '0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596',
          flag: '0',
        },
      },
    ],
  },
};

// ============ Transform raw API data → SDK types ============

/**
 * Maps the raw API request to the SDK SolveRequest type.
 * Strips extra fields (chainIndex, deadline, tokens, settlementContract, orderUid, createTime)
 * and normalizes commission feeAmount (null → ignored by SDK).
 */
function toSolveRequest(raw: typeof rawRequest): SolveRequest {
  return {
    auctionId: raw.auctionId,
    orders: raw.orders.map((order) => ({
      fromTokenAddress: order.fromTokenAddress,
      toTokenAddress: order.toTokenAddress,
      owner: order.owner,
      receiver: order.receiver,
      fromTokenAmount: order.fromTokenAmount,
      toTokenAmount: order.toTokenAmount,
      validTo: order.validTo,
      appDataHash: order.appDataHash,
      swapMode: order.swapMode,
      partiallyFillable: order.partiallyFillable,
      signingScheme: order.signingScheme,
      signature: order.signature,
      commissionInfos: order.commissionInfos.map((ci) => ({
        feePercent: ci.feePercent,
        referrerWalletAddress: ci.referrerWalletAddress,
        feeDirection: ci.feeDirection,
        toB: ci.toB,
        commissionType: ci.commissionType,
      })),
    })),
  };
}

/**
 * Maps the raw API response to the SDK SolveResponse type.
 *
 * Key transformations:
 * 1. Unwrap { code, msg, data } envelope → extract data.solutions
 * 2. Strip extra fields from response orders (orderUid, swapMode, fromToken/toToken amounts, etc.)
 * 3. surplusFeeInfo is already at solution level — pass through directly
 */
function toSolveResponse(raw: typeof rawResponse): SolveResponse {
  return {
    solutions: raw.data.solutions.map((solution) => ({
      clearingPrices: solution.clearingPrices,
      orders: solution.orders.map((order) => ({
        executedFromTokenAmount: order.executedFromTokenAmount,
        executedToTokenAmount: order.executedToTokenAmount,
        commissionInfos: order.commissionInfos.map((ci) => ({
          feePercent: ci.feePercent,
          referrerWalletAddress: ci.referrerWalletAddress,
          feeDirection: ci.feeDirection,
          toB: ci.toB,
          commissionType: ci.commissionType,
        })),
        solverFeeInfo: {
          feePercent: order.solverFeeInfo.feePercent,
          solverAddress: order.solverFeeInfo.solverAddress,
          feeDirection: order.solverFeeInfo.feeDirection,
          feeAmount: order.solverFeeInfo.feeAmount,
        },
      })),
      surplusFeeInfo: {
        feePercent: solution.surplusFeeInfo.feePercent,
        trimReceiver: solution.surplusFeeInfo.trimReceiver,
        flag: solution.surplusFeeInfo.flag,
      },
    })),
  };
}

// ============ Main: build calldata and print results ============

function main() {
  const request = toSolveRequest(rawRequest);
  const response = toSolveResponse(rawResponse);

  console.log('--- Build Calldata Example ---\n');

  // 1. Verify request transformation
  console.log('[Request]');
  console.log('  auctionId:', request.auctionId);
  console.log('  orders:', request.orders.length);
  console.log('  owner:', request.orders[0].owner);
  console.log('  commissions:', request.orders[0].commissionInfos.length);
  request.orders[0].commissionInfos.forEach((ci, i) => {
    console.log(`    [${i}] ${ci.commissionType} → ${ci.feePercent} (1e9)`);
  });

  // 2. Verify response transformation
  console.log('\n[Response]');
  console.log('  solutions:', response.solutions.length);
  console.log('  executedFrom:', response.solutions[0].orders[0].executedFromTokenAmount);
  console.log('  executedTo:', response.solutions[0].orders[0].executedToTokenAmount);
  console.log('  surplusReceiver:', response.solutions[0].surplusFeeInfo.trimReceiver);

  // 3. Build calldata using API clearing prices
  console.log('\n[Calldata - API Prices]');
  const result = buildSettleCalldata(request, response);

  console.log('  calldata:', result.calldata.slice(0, 66) + '...');
  console.log('  settleId:', result.params.settleId.toString());
  console.log('  tokens:', result.params.tokens);
  console.log('  clearingPrices:', result.params.clearingPrices.map(String));
  console.log('  trades:', result.params.trades.length);

  const trade = result.params.trades[0];
  console.log('  trade.fromTokenAddressIndex:', trade.fromTokenAddressIndex);
  console.log('  trade.toTokenAddressIndex:', trade.toTokenAddressIndex);
  console.log('  trade.owner:', trade.owner);
  console.log('  trade.receiver:', trade.receiver);
  console.log('  trade.fromTokenAmount:', trade.fromTokenAmount.toString());
  console.log('  trade.toTokenAmount:', trade.toTokenAmount.toString());
  console.log('  trade.executedAmount:', trade.executedAmount.toString());
  console.log('  trade.commissions:', trade.commissionInfos.length);
  trade.commissionInfos.forEach((ci, i) => {
    console.log(`    [${i}] feePercent=${ci.feePercent} receiver=${ci.referrerWalletAddress}`);
  });
  console.log('  trade.solverFee:', trade.solverFeeInfo.feePercent.toString());
  console.log('  surplusFee:', result.params.surplusFeeInfo.feePercent.toString());

  // 4. Build calldata using computed clearing prices
  console.log('\n[Calldata - Computed Prices]');
  const resultComputed = buildSettleCalldata(request, response, { useComputedPrices: true });

  console.log('  calldata:', resultComputed.calldata.slice(0, 66) + '...');
  console.log('  clearingPrices:', resultComputed.params.clearingPrices.map(String));

  // Verify computed prices match expected values
  // fromToken fees: 0.3% + 0.1% + 0.05% = 0.45% total
  // total fromTokenFee = 6000000000000 + 2000000000000 + 1000000000000 = 9000000000000
  const expectedFromFee = 6000000000000n + 2000000000000n + 1000000000000n;
  const expectedPriceSell = 3860897n; // P_s = executedToTokenAmount
  const expectedPriceBuy = 2000000000000000n - expectedFromFee; // P_b = executedFromTokenAmount - fee

  console.log('  expected P_s (WETH):', expectedPriceSell.toString());
  console.log('  expected P_b (USDC):', expectedPriceBuy.toString());
  console.log(
    '  P_s match:',
    resultComputed.params.clearingPrices[0] === expectedPriceSell ? '✅' : '❌'
  );
  console.log(
    '  P_b match:',
    resultComputed.params.clearingPrices[1] === expectedPriceBuy ? '✅' : '❌'
  );

  console.log('\n✅ Build calldata example completed');
}

main();
