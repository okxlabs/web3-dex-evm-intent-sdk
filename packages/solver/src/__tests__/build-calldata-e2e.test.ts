/**
 * E2E test: Build Settlement.settle() calldata from real Solver API request/response.
 *
 * Verifies the full pipeline: raw API JSON → SDK types → ABI-encoded calldata.
 * Uses production-like data from the /solve endpoint.
 */

import { ethers } from 'ethers';
import { SETTLEMENT_ABI } from '@okx-intent-swap/sdk-contracts';
import { COMMISSION_DENOM } from '@okx-intent-swap/sdk-common';
import { buildSettleCalldata } from '../calldata-builder.js';
import type { SolveRequest, SolveResponse } from '../types.js';
import { LABEL_OKX, LABEL_CHILD, LABEL_PARENT } from '../constants.js';

// ============ Raw API Data ============

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const OWNER = '0x3474fbbc6e43dcb0398e2eacbe1032cced806742';
const SOLVER = '0xaFe9d55A5a4e90bBBabBa0327BF72196B5683596';
const OKX_REFERRER = '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d';
const CHILD_REFERRER = '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7';
const PARENT_REFERRER = '0x3474fbbc6e43dcb0398e2eacbe1032cced806742';
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

// settleId is assigned by Autopilot in /settle callback, distinct from auctionId
const SETTLE_ID = '16888616559299999';

/**
 * Raw /solve request from API — includes extra fields not needed by SDK.
 */
const rawRequest = {
  chainIndex: 1,
  auctionId: '16888616559291392',
  deadline: 1772435845666,
  orders: [
    {
      orderUid:
        '0x7651e48dfb187bfcd85c193a3fd4d044defdaa2cfdb48aff90b1b5d28885f0ec3474fbbc6e43dcb0398e2eacbe1032cced80674269a92d34',
      owner: OWNER,
      fromTokenAddress: WETH,
      toTokenAddress: USDC,
      fromTokenAmount: '2000000000000000',
      toTokenAmount: '3827335',
      swapMode: 'exactIn',
      partiallyFillable: false,
      validTo: 1772694836,
      appDataHash: '0xb44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce',
      signature:
        '0x0fce841f6acd0ae9d16b621bc19b4f8424764278573f3cf026463b9a30ac46d34b44addf867e5f53dd342daaaf5a2ca26af56da42d40f2d2e99e58213f93f4f71c',
      signingScheme: 'eip712',
      receiver: OWNER,
      createTime: 1772435638,
      commissionInfos: [
        {
          feePercent: '3000000',
          feeAmount: null,
          referrerWalletAddress: OKX_REFERRER,
          commissionType: 'okx',
          feeDirection: true,
          toB: false,
        },
        {
          feePercent: '1000000',
          feeAmount: null,
          referrerWalletAddress: CHILD_REFERRER,
          commissionType: 'child',
          feeDirection: true,
          toB: false,
        },
        {
          feePercent: '500000',
          feeAmount: null,
          referrerWalletAddress: PARENT_REFERRER,
          commissionType: 'parent',
          feeDirection: true,
          toB: false,
        },
      ],
    },
  ],
  tokens: [
    { address: WETH, price: '3980.317435057675563497' },
    { address: USDC, price: '1' },
  ],
  settlementContract: '0x1a34e1e604d8a55405172c0717b17f7631d5f265',
};

/**
 * Raw /solve response from API — wrapped in { code, msg, data } envelope.
 * surplusFeeInfo is at solution level.
 */
const rawResponse = {
  code: 0,
  msg: 'success',
  data: {
    solutions: [
      {
        submissionAddress: SOLVER,
        orders: [
          {
            orderUid:
              '0x7651e48dfb187bfcd85c193a3fd4d044defdaa2cfdb48aff90b1b5d28885f0ec3474fbbc6e43dcb0398e2eacbe1032cced80674269a92d34',
            swapMode: 'exactIn',
            fromTokenAddress: WETH,
            toTokenAddress: USDC,
            fromTokenAmount: '2000000000000000',
            toTokenAmount: '3827335',
            executedFromTokenAmount: '2000000000000000',
            executedToTokenAmount: '3860897',
            solverFeeInfo: {
              feePercent: '0',
              feeAmount: '0',
              solverAddress: SOLVER,
              feeDirection: true,
            },
            commissionInfos: [
              {
                feePercent: '3000000',
                feeAmount: '6000000000000',
                referrerWalletAddress: OKX_REFERRER,
                commissionType: 'okx',
                feeDirection: true,
                toB: false,
              },
              {
                feePercent: '1000000',
                feeAmount: '2000000000000',
                referrerWalletAddress: CHILD_REFERRER,
                commissionType: 'child',
                feeDirection: true,
                toB: false,
              },
              {
                feePercent: '500000',
                feeAmount: '1000000000000',
                referrerWalletAddress: PARENT_REFERRER,
                commissionType: 'parent',
                feeDirection: true,
                toB: false,
              },
            ],
          },
        ],
        clearingPrices: {
          [USDC]: '0.000000001939175082119537920642893019',
          [WETH]: '1',
        },
        surplusFeeInfo: {
          feePercent: '0',
          trimReceiver: SOLVER,
          flag: '0',
        },
      },
    ],
  },
};

// ============ Transform helpers ============

function toSolveRequest(raw: typeof rawRequest): SolveRequest {
  return {
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

// ============ Tests ============

describe('E2E: real API data → calldata', () => {
  const request = toSolveRequest(rawRequest);
  const response = toSolveResponse(rawResponse);

  it('should produce decodable calldata with correct settleId and tokens', () => {
    const result = buildSettleCalldata(request, response, SETTLE_ID);
    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);

    // settleId
    expect(decoded.settleId.toString()).toBe(SETTLE_ID);

    // Tokens: WETH first (from), USDC second (to) — insertion order from request
    expect(decoded.tokens.length).toBe(2);
    expect(decoded.tokens[0].toLowerCase()).toBe(WETH);
    expect(decoded.tokens[1].toLowerCase()).toBe(USDC);
  });

  it('should encode clearing prices correctly from decimal strings', () => {
    const result = buildSettleCalldata(request, response, SETTLE_ID, { useComputedPrices: false });

    // WETH = "1", USDC = "0.000000001939175082119537920642893019" (36 decimal places)
    // Scale by 10^36: WETH = 1 * 10^36, USDC = 1_939_175_082_119_537_920_642_893_019
    expect(result.params.clearingPrices[0]).toBe(10n ** 36n); // WETH
    expect(result.params.clearingPrices[1]).toBe(1939175082119537920642893019n); // USDC
  });

  it('should build trade with correct owner, receiver, and amounts', () => {
    const result = buildSettleCalldata(request, response, SETTLE_ID);
    const trade = result.params.trades[0];

    expect(trade.fromTokenAddressIndex).toBe(0); // WETH
    expect(trade.toTokenAddressIndex).toBe(1);   // USDC
    expect(trade.owner).toBe(OWNER);
    expect(trade.receiver).toBe(OWNER); // receiver preserved as-is for EIP-712 hash correctness
    expect(trade.fromTokenAmount).toBe(2000000000000000n);
    expect(trade.toTokenAmount).toBe(3827335n);
    expect(trade.executedAmount).toBe(2000000000000000n); // exactIn → fromToken
  });

  it('should encode commission flags with correct label bits', () => {
    const result = buildSettleCalldata(request, response, SETTLE_ID);
    const cis = result.params.trades[0].commissionInfos;

    expect(cis).toHaveLength(3);

    // okx: 0.3%, FROM_TOKEN + LABEL_OKX
    expect(cis[0].feePercent).toBe(3000000n);
    expect(cis[0].referrerWalletAddress).toBe(OKX_REFERRER);
    expect(cis[0].flag & LABEL_OKX).toBe(LABEL_OKX);

    // child: 0.1%, FROM_TOKEN + LABEL_CHILD
    expect(cis[1].feePercent).toBe(1000000n);
    expect(cis[1].referrerWalletAddress).toBe(CHILD_REFERRER);
    expect(cis[1].flag & LABEL_CHILD).toBe(LABEL_CHILD);

    // parent: 0.05%, FROM_TOKEN + LABEL_PARENT
    expect(cis[2].feePercent).toBe(500000n);
    expect(cis[2].referrerWalletAddress).toBe(PARENT_REFERRER);
    expect(cis[2].flag & LABEL_PARENT).toBe(LABEL_PARENT);
  });

  it('should encode solver fee and surplus fee correctly', () => {
    const result = buildSettleCalldata(request, response, SETTLE_ID);
    const trade = result.params.trades[0];

    expect(trade.solverFeeInfo.feePercent).toBe(0n);
    expect(trade.solverFeeInfo.solverAddr).toBe(SOLVER);

    expect(result.params.surplusFeeInfo.feePercent).toBe(0n);
    expect(result.params.surplusFeeInfo.trimReceiver).toBe(SOLVER);
  });

  it('should compute correct clearing prices from execution amounts (useComputedPrices)', () => {
    const result = buildSettleCalldata(request, response, SETTLE_ID, { useComputedPrices: true });

    const eS = 2000000000000000n;
    const eB = 3860897n;

    // fromToken fees computed per FeeLib.sol: floor(eS * feePercent / COMMISSION_DENOM)
    const okxFee = (eS * 3000000n) / COMMISSION_DENOM;     // 6_000_000_000_000
    const childFee = (eS * 1000000n) / COMMISSION_DENOM;   // 2_000_000_000_000
    const parentFee = (eS * 500000n) / COMMISSION_DENOM;   // 1_000_000_000_000
    const totalFromFee = okxFee + childFee + parentFee;     // 9_000_000_000_000

    // Verify individual fee amounts match API response
    expect(okxFee).toBe(6000000000000n);
    expect(childFee).toBe(2000000000000n);
    expect(parentFee).toBe(1000000000000n);

    // P_s (WETH index=0) = eB = 3860897
    expect(result.params.clearingPrices[0]).toBe(eB);

    // P_b (USDC index=1) = eS - fromTokenFee = 2000000000000000 - 9000000000000 = 1991000000000000
    expect(result.params.clearingPrices[1]).toBe(eS - totalFromFee);
  });

  it('should produce identical calldata length for both price modes', () => {
    const resultApi = buildSettleCalldata(request, response, SETTLE_ID, { useComputedPrices: false });
    const resultComputed = buildSettleCalldata(request, response, SETTLE_ID);

    // Calldata structure is the same, only clearing price values differ
    expect(resultApi.calldata.length).toBe(resultComputed.calldata.length);
  });
});
