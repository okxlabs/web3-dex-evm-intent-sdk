/**
 * Example: Build Settlement.settle() calldata from real Solver API request/response.
 *
 * This example demonstrates how to transform raw API JSON into SDK types
 * and produce ABI-encoded calldata ready for on-chain submission.
 *
 * Usage:
 *   cd sdk && npx jest --testPathPattern=examples/build-calldata-example
 */

import { buildSettleCalldata } from '../src/calldata-builder';
import type { SolveRequest, SolveResponse } from '../src/types';

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

// ============ Test: verify the full pipeline ============

describe('build-calldata-example: real API data end-to-end', () => {
  const request = toSolveRequest(rawRequest);
  const response = toSolveResponse(rawResponse);

  it('should transform raw request to SDK type correctly', () => {
    expect(request.auctionId).toBe('16888616559291392');
    expect(request.orders).toHaveLength(1);
    expect(request.orders[0].owner).toBe('0x3474fbbc6e43dcb0398e2eacbe1032cced806742');
    expect(request.orders[0].commissionInfos).toHaveLength(3);
    expect(request.orders[0].commissionInfos[0].commissionType).toBe('okx');
    expect(request.orders[0].commissionInfos[1].commissionType).toBe('child');
    expect(request.orders[0].commissionInfos[2].commissionType).toBe('parent');
  });

  it('should transform raw response to SDK type correctly', () => {
    expect(response.solutions).toHaveLength(1);
    expect(response.solutions[0].orders).toHaveLength(1);
    expect(response.solutions[0].orders[0].executedFromTokenAmount).toBe('2000000000000000');
    expect(response.solutions[0].orders[0].executedToTokenAmount).toBe('3860897');
    expect(response.solutions[0].surplusFeeInfo.trimReceiver).toBe(
      '0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596'
    );
  });

  it('should build valid calldata using API clearing prices', () => {
    const result = buildSettleCalldata(request, response);

    // Verify basic structure
    expect(result.calldata).toMatch(/^0x/);
    expect(result.params.settleId).toBe(16888616559291392n);
    expect(result.params.tokens).toHaveLength(2);

    // Tokens: WETH first (from), USDC second (to) — insertion order
    expect(result.params.tokens[0]).toBe('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    expect(result.params.tokens[1]).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');

    // Clearing prices scaled from decimal strings
    // WETH = "1", USDC = "0.000000001939175082119537920642893019"
    // maxDecimals = 33, WETH = 1 * 10^33, USDC = 1939175082119537920642893019
    expect(result.params.clearingPrices).toHaveLength(2);
    expect(result.params.clearingPrices[0]).toBeGreaterThan(0n); // WETH
    expect(result.params.clearingPrices[1]).toBeGreaterThan(0n); // USDC

    // Trade
    expect(result.params.trades).toHaveLength(1);
    const trade = result.params.trades[0];
    expect(trade.fromTokenAddressIndex).toBe(0); // WETH
    expect(trade.toTokenAddressIndex).toBe(1);   // USDC
    expect(trade.owner).toBe('0x3474fbbc6e43dcb0398e2eacbe1032cced806742');
    // receiver === owner → address(0)
    expect(trade.receiver).toBe('0x0000000000000000000000000000000000000000');
    expect(trade.fromTokenAmount).toBe(2000000000000000n);
    expect(trade.toTokenAmount).toBe(3827335n);
    // exactIn → executedAmount = executedFromTokenAmount
    expect(trade.executedAmount).toBe(2000000000000000n);

    // 3 commission entries with correct flags
    expect(trade.commissionInfos).toHaveLength(3);
    expect(trade.commissionInfos[0].feePercent).toBe(3000000n);  // okx 0.3%
    expect(trade.commissionInfos[1].feePercent).toBe(1000000n);  // child 0.1%
    expect(trade.commissionInfos[2].feePercent).toBe(500000n);   // parent 0.05%

    // Solver fee = 0
    expect(trade.solverFeeInfo.feePercent).toBe(0n);
    expect(trade.solverFeeInfo.solverAddr).toBe('0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596');

    // Surplus fee
    expect(result.params.surplusFeeInfo.feePercent).toBe(0n);
    expect(result.params.surplusFeeInfo.trimReceiver).toBe('0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596');
  });

  it('should build valid calldata using computed clearing prices', () => {
    const result = buildSettleCalldata(request, response, { useComputedPrices: true });

    expect(result.calldata).toMatch(/^0x/);

    // eS = 2000000000000000, eB = 3860897
    // fromToken fees: 0.3% + 0.1% + 0.05% = 0.45% total
    // commission fee = floor(2000000000000000 * 3000000 / 1e9) = 6000000000000
    //                + floor(2000000000000000 * 1000000 / 1e9) = 2000000000000
    //                + floor(2000000000000000 * 500000 / 1e9)  = 1000000000000
    // solver fee = 0
    // total fromTokenFee = 9000000000000
    const expectedFromFee = 6000000000000n + 2000000000000n + 1000000000000n;

    // P_s (WETH slot) = eB = 3860897
    expect(result.params.clearingPrices[0]).toBe(3860897n);
    // P_b (USDC slot) = eS - fromTokenFee = 2000000000000000 - 9000000000000 = 1991000000000000
    expect(result.params.clearingPrices[1]).toBe(2000000000000000n - expectedFromFee);
  });
});
