/**
 * Example: Build Settlement.settle() calldata from Solver API request/response.
 *
 * Demonstrates two scenarios:
 * 1. Without interactions (empty [pre, swap, post])
 * 2. With interactions (approve + DEX swap in swap phase)
 *
 * When interactions are provided, the SDK automatically:
 * - Duplicates tokens: set(tradeTokens) + list(tradeTokens)
 * - Sets clearingPrice = 0 for interaction token slots
 * - Offsets trade token indices by tradeTokens.length
 *
 * Usage:
 *   pnpm build && node dist/build-calldata.js
 */

import type { Interaction } from '@okx-intent-swap/sdk-common';
import {
  buildSettleCalldata,
  reconstructFromCalldata,
  type SolveRequest,
  type SolveResponse,
} from '@okx-intent-swap/sdk-solver';
import { ethers } from 'ethers';

// ============ Raw API Input (as received from /solve and /settle endpoints) ============

const SETTLE_ID = '16893382874345600';

/**
 * Raw /solve request body — contains fields beyond what the SDK needs.
 * Fields like chainIndex, deadline, tokens, settlementContract, orderUid,
 * createTime are used by the API but not required for calldata encoding.
 */
const rawRequest = {
  chainIndex: 1,
  auctionId: '16893382867594432',
  deadline: 1782508573740,
  orders: [
    {
      orderUid:
        '0x63f0b8c6a70542a89fb82eb5b46df3155915c9f5726f317a06a7dddcb06027a03474fbbc6e43dcb0398e2eacbe1032cced80674269aa4a0f',
      owner: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
      fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      toTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      fromTokenAmount: '2000000000000000',
      toTokenAmount: '3888371',
      swapMode: 'exactIn',
      partiallyFillable: false,
      validTo: 1772767759,
      appDataHash: '0xb44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce',
      signature:
        '0xb77e58fe3adcd5adc8f143b0ea88c894f5e027e47eb5f1b71eab080ef8c29a4d07ef908ebb9dbc3f9e3944a52d5fcde88584b34e9facf5794b0ea0be90ab69001c',
      signingScheme: 'eip712',
      receiver: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
      createTime: 1772508560,
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
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', price: '0.99993' },
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
              '0x63f0b8c6a70542a89fb82eb5b46df3155915c9f5726f317a06a7dddcb06027a03474fbbc6e43dcb0398e2eacbe1032cced80674269aa4a0f',
            swapMode: 'exactIn',
            fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            toTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            fromTokenAmount: '2000000000000000',
            toTokenAmount: '3888371',
            executedFromTokenAmount: '2000000000000000',
            executedToTokenAmount: '3927733',
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
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '0.000000001972743935208437970868910096',
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

// ============ Interactions: Solver builds DEX swap calldata ============

/**
 * Builds solver interactions for the swap phase.
 *
 * A typical solver flow:
 * 1. Approve DEX router to spend fromToken
 * 2. Execute swap via DEX aggregator (WETH → USDC)
 *
 * The Settlement contract executes these during the swap phase,
 * and tracks balance deltas for the interaction tokens.
 */
function buildSwapInteractions(
  fromToken: string,
  dexTokenApproveAddress: string,
  dexAggregatorAddress: string,
  dexSwapCalldata: string
): Interaction[] {
  const erc20Iface = new ethers.utils.Interface([
    'function approve(address spender, uint256 amount)',
  ]);

  // Interaction 1: Approve DEX router to spend fromToken
  const approveCalldata = erc20Iface.encodeFunctionData('approve', [
    dexTokenApproveAddress,
    ethers.constants.MaxUint256,
  ]);

  // Interaction 2: Execute DEX swap
  return [
    {
      target: fromToken,
      value: 0n,
      callData: approveCalldata,
    },
    {
      target: dexAggregatorAddress,
      value: 0n,
      callData: dexSwapCalldata,
    },
  ];
}

// ============ Main: build calldata and print results ============

function main() {
  const request = toSolveRequest(rawRequest);
  const response = toSolveResponse(rawResponse);

  console.log('--- Build Calldata Example ---\n');

  // 1. Verify request/response transformation
  console.log('[Request]');
  console.log('  orders:', request.orders.length);
  console.log('  owner:', request.orders[0].owner);
  console.log('  commissions:', request.orders[0].commissionInfos.length);
  request.orders[0].commissionInfos.forEach((ci: { commissionType: string; feePercent: string }, i: number) => {
    console.log(`    [${i}] ${ci.commissionType} → ${ci.feePercent} (1e9)`);
  });

  console.log('\n[Response]');
  console.log('  solutions:', response.solutions.length);
  console.log('  executedFrom:', response.solutions[0].orders[0].executedFromTokenAmount);
  console.log('  executedTo:', response.solutions[0].orders[0].executedToTokenAmount);
  console.log('  surplusReceiver:', response.solutions[0].surplusFeeInfo.trimReceiver);

  // ============================================================
  // Scenario 1: Without interactions (empty phases)
  // ============================================================
  console.log('\n========== Scenario 1: Without Interactions ==========');

  const result1 = buildSettleCalldata(request, response, SETTLE_ID, {
    interactions: [[], [], []],
    useComputedPrices: true,
  });

  console.log('  tokens count:', result1.params.tokens.length);
  console.log('  tokens:', result1.params.tokens);
  console.log('  clearingPrices:', result1.params.clearingPrices.map(String));
  console.log('  trade.fromTokenAddressIndex:', result1.params.trades[0].fromTokenAddressIndex);
  console.log('  trade.toTokenAddressIndex:', result1.params.trades[0].toTokenAddressIndex);
  console.log('  calldata:', result1.calldata.slice(0, 66) + '...');

  // Verify: tokens = [WETH, USDC], prices = [P_s, P_b], indices = [0, 1]
  const expectedPriceSell = 3927733n;
  const expectedPriceBuy = 2000000000000000n - 9000000000000n; // 1991000000000000
  console.log('  P_s match:', result1.params.clearingPrices[0] === expectedPriceSell ? '✅' : '❌');
  console.log('  P_b match:', result1.params.clearingPrices[1] === expectedPriceBuy ? '✅' : '❌');

  // Cross-verification: calldata → reconstructFromCalldata → compare with original request/response
  console.log('\n  --- Cross-Verification (Scenario 1) ---');
  const recon1 = reconstructFromCalldata(result1.calldata);
  const reqOrder0 = request.orders[0];
  const reconReqOrder0 = recon1.request.orders[0];
  const resOrder0 = response.solutions[0].orders[0];
  const reconResOrder0 = recon1.response.solutions[0].orders[0];
  console.log('  settleId match:',
    recon1.settleId.toString() === SETTLE_ID ? '✅' : '❌');
  console.log('  fromTokenAddress match:',
    reconReqOrder0.fromTokenAddress.toLowerCase() === reqOrder0.fromTokenAddress.toLowerCase() ? '✅' : '❌');
  console.log('  toTokenAddress match:',
    reconReqOrder0.toTokenAddress.toLowerCase() === reqOrder0.toTokenAddress.toLowerCase() ? '✅' : '❌');
  console.log('  owner match:',
    reconReqOrder0.owner.toLowerCase() === reqOrder0.owner.toLowerCase() ? '✅' : '❌');
  console.log('  receiver match:',
    reconReqOrder0.receiver.toLowerCase() === reqOrder0.receiver.toLowerCase() ? '✅' : '❌');
  console.log('  fromTokenAmount match:',
    reconReqOrder0.fromTokenAmount === reqOrder0.fromTokenAmount ? '✅' : '❌');
  console.log('  toTokenAmount match:',
    reconReqOrder0.toTokenAmount === reqOrder0.toTokenAmount ? '✅' : '❌');
  console.log('  swapMode match:',
    reconReqOrder0.swapMode === reqOrder0.swapMode ? '✅' : '❌');
  console.log('  signingScheme match:',
    reconReqOrder0.signingScheme === reqOrder0.signingScheme ? '✅' : '❌');
  console.log('  executedFromTokenAmount match:',
    reconResOrder0.executedFromTokenAmount === resOrder0.executedFromTokenAmount ? '✅' : '❌');
  console.log('  executedToTokenAmount match:',
    reconResOrder0.executedToTokenAmount === resOrder0.executedToTokenAmount ? '✅' : '❌');
  console.log('  commissionInfos match:',
    reconReqOrder0.commissionInfos.every((ci, i) =>
      ci.feePercent === reqOrder0.commissionInfos[i].feePercent &&
      ci.feeDirection === reqOrder0.commissionInfos[i].feeDirection &&
      ci.toB === reqOrder0.commissionInfos[i].toB &&
      ci.commissionType === reqOrder0.commissionInfos[i].commissionType
    ) ? '✅' : '❌');
  // Reverse: re-encode from reconstructed data, verify calldata matches
  const reEncoded1 = buildSettleCalldata(recon1.request, recon1.response, recon1.settleId, {
    interactions: recon1.interactions,
    useComputedPrices: false,
  });
  console.log('  re-encode calldata match:',
    reEncoded1.calldata === result1.calldata ? '✅' : '❌');

  // ============================================================
  // Scenario 2: With interactions (approve + DEX swap)
  // ============================================================
  console.log('\n========== Scenario 2: With Interactions ==========');

  // Solver constructs DEX swap interactions
  // (In production, dexSwapCalldata comes from the solver's routing engine)
  const DEX_TOKEN_APPROVE_ADDRESS = '0xffb8322deeeadf0d61589211493fb2dc668d3cc0';
  const DEX_AGGREGATOR = '0xDcB7028E5EAA1d7bB82B7152Cb0e7adC12e7457c';
  const WETH = rawRequest.orders[0].fromTokenAddress;

  // Placeholder DEX swap calldata (in production, this is the actual aggregator call)
  const dexSwapCalldata = '0xf2c42696' + '00'.repeat(32); // simplified for example

  const swapInteractions = buildSwapInteractions(WETH, DEX_TOKEN_APPROVE_ADDRESS, DEX_AGGREGATOR, dexSwapCalldata);

  const result2 = buildSettleCalldata(request, response, SETTLE_ID, {
    interactions: [[], swapInteractions, []], // [pre=empty, swap=approve+dex, post=empty]
    useComputedPrices: true,
  });

  console.log('  tokens count:', result2.params.tokens.length, '(2 interaction + 2 trade)');
  console.log('  tokens:', result2.params.tokens);
  console.log('  clearingPrices:', result2.params.clearingPrices.map(String));
  console.log('  trade.fromTokenAddressIndex:', result2.params.trades[0].fromTokenAddressIndex);
  console.log('  trade.toTokenAddressIndex:', result2.params.trades[0].toTokenAddressIndex);
  console.log('  interactions[swap]:', result2.params.interactions[1].length, 'interactions');
  console.log('  calldata:', result2.calldata.slice(0, 66) + '...');

  // Verify: tokens = [WETH, USDC, WETH, USDC]
  //   prices = [0, 0, P_s, P_b]
  //   indices = [2, 3] (offset by 2)
  console.log('  interaction prices are 0:',
    result2.params.clearingPrices[0] === 0n && result2.params.clearingPrices[1] === 0n ? '✅' : '❌');
  console.log('  trade prices correct:',
    result2.params.clearingPrices[2] === expectedPriceSell &&
    result2.params.clearingPrices[3] === expectedPriceBuy ? '✅' : '❌');
  console.log('  trade indices offset by 2:',
    result2.params.trades[0].fromTokenAddressIndex === 2 &&
    result2.params.trades[0].toTokenAddressIndex === 3 ? '✅' : '❌');

  // Cross-verification: calldata → reconstructFromCalldata → re-encode → compare
  console.log('\n  --- Cross-Verification (Scenario 2) ---');
  const recon2 = reconstructFromCalldata(result2.calldata);
  console.log('  interactions[swap] count match:',
    recon2.interactions[1].length === result2.params.interactions[1].length ? '✅' : '❌');
  console.log('  interaction[swap][0].target match:',
    recon2.interactions[1][0]?.target.toLowerCase() === result2.params.interactions[1][0]?.target.toLowerCase() ? '✅' : '❌');
  console.log('  executedToTokenAmount match:',
    recon2.response.solutions[0].orders[0].executedToTokenAmount === resOrder0.executedToTokenAmount ? '✅' : '❌');
  const reEncoded2 = buildSettleCalldata(recon2.request, recon2.response, recon2.settleId, {
    interactions: recon2.interactions,
    useComputedPrices: false,
  });
  console.log('  re-encode calldata match:',
    reEncoded2.calldata === result2.calldata ? '✅' : '❌');

  console.log('\n✅ Build calldata example completed');
}

main();
