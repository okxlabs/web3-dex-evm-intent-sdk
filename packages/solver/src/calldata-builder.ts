/**
 * Core function: buildSettleCalldata()
 *
 * Assembles a /solve request + response into hex-encoded calldata
 * that can be sent directly to Settlement.settle() on-chain.
 */

import { ethers } from 'ethers';
import { SETTLEMENT_ABI } from '@okx-intent-swap/sdk-contracts';
import type { Interaction } from '@okx-intent-swap/sdk-common';
import type { SolveRequest, SolveResponse } from './types';
import {
  collectTokenAddresses,
  buildTokenIndexMap,
  convertClearingPrices,
  buildTradeFromSolveOrders,
  convertApiSurplusFeeInfo,
  computeCustomPrices,
  buildClearingPricesFromCustomPrices,
} from './converters';
import type { OrderCustomPrice } from './converters';

/**
 * Options for buildSettleCalldata.
 */
export interface BuildSettleCalldataOptions {
  /** External interactions [pre, swap, post], defaults to [[], [], []] */
  interactions?: [Interaction[], Interaction[], Interaction[]];
  /** Solution index to use from response.solutions, defaults to 0 */
  solutionIndex?: number;
  /** Compute clearing prices from execution amounts + fees instead of using solution.clearingPrices */
  useComputedPrices?: boolean;
}

/**
 * Result returned by buildSettleCalldata.
 */
export interface BuildSettleCalldataResult {
  /** Hex-encoded calldata string (0x-prefixed) */
  calldata: string;
  /** Decoded settle parameters for inspection */
  params: {
    settleId: bigint;
    tokens: string[];
    clearingPrices: bigint[];
    trades: ReturnType<typeof buildTradeFromSolveOrders>[];
    interactions: [Interaction[], Interaction[], Interaction[]];
    surplusFeeInfo: { feePercent: bigint; trimReceiver: string; flag: bigint };
  };
}

/**
 * Builds hex-encoded calldata for Settlement.settle() from Solver API data.
 *
 * Flow:
 * 1. Select solution from response (default index 0)
 * 2. Collect all unique token addresses → tokens[]
 * 3. Convert clearing prices (decimal string → uint256)
 * 4. Build Trade[] by merging request orders + response execution data
 * 5. Convert surplusFeeInfo
 * 6. ABI-encode everything as settle() calldata
 *
 * @param request - /solve request body
 * @param response - /solve response body
 * @param options - Optional configuration
 * @returns Hex-encoded calldata string (0x-prefixed)
 */
export function buildSettleCalldata(
  request: SolveRequest,
  response: SolveResponse,
  options?: BuildSettleCalldataOptions
): BuildSettleCalldataResult {
  const solutionIndex = options?.solutionIndex ?? 0;
  const interactions = options?.interactions ?? [[], [], []];

  // Validate inputs
  if (!response.solutions || response.solutions.length === 0) {
    throw new Error('Response contains no solutions');
  }
  if (solutionIndex >= response.solutions.length) {
    throw new Error(
      `Solution index ${solutionIndex} out of range (${response.solutions.length} solutions)`
    );
  }

  const solution = response.solutions[solutionIndex];

  if (request.orders.length !== solution.orders.length) {
    throw new Error(
      `Order count mismatch: request has ${request.orders.length}, solution has ${solution.orders.length}`
    );
  }

  // Step 1: settleId from auctionId
  const settleId = BigInt(request.auctionId);

  // Step 2: Collect token addresses (ordered, deduplicated)
  const tokens = collectTokenAddresses(request.orders);
  const tokenIndexMap = buildTokenIndexMap(tokens);

  // Step 3: Convert clearing prices
  let clearingPrices: bigint[];
  if (options?.useComputedPrices) {
    // Compute per-order custom prices from execution data + fees
    const orderCustomPrices: OrderCustomPrice[] = request.orders.map((reqOrder, i) => {
      const resOrder = solution.orders[i];
      const fromTokenIndex = tokenIndexMap.get(reqOrder.fromTokenAddress.toLowerCase());
      const toTokenIndex = tokenIndexMap.get(reqOrder.toTokenAddress.toLowerCase());
      if (fromTokenIndex === undefined) {
        throw new Error(`fromToken not found in tokens array: ${reqOrder.fromTokenAddress}`);
      }
      if (toTokenIndex === undefined) {
        throw new Error(`toToken not found in tokens array: ${reqOrder.toTokenAddress}`);
      }

      const prices = computeCustomPrices(
        BigInt(resOrder.executedFromTokenAmount),
        BigInt(resOrder.executedToTokenAmount),
        resOrder.commissionInfos,
        resOrder.solverFeeInfo
      );

      return { fromTokenIndex, toTokenIndex, prices };
    });

    clearingPrices = buildClearingPricesFromCustomPrices(orderCustomPrices, tokens.length);
  } else {
    clearingPrices = convertClearingPrices(solution.clearingPrices, tokens);
  }

  // Step 4: Build trades and sort by toTokenAddressIndex (ascending)
  // Settlement contract requires: trades[i].toTokenAddressIndex >= trades[i-1].toTokenAddressIndex
  const trades = request.orders
    .map((reqOrder, i) => buildTradeFromSolveOrders(reqOrder, solution.orders[i], tokenIndexMap))
    .sort((a, b) => a.toTokenAddressIndex - b.toTokenAddressIndex);

  // Step 5: Convert surplusFeeInfo
  const surplusFeeInfo = convertApiSurplusFeeInfo(solution.surplusFeeInfo);

  // Step 6: ABI-encode calldata
  const iface = new ethers.utils.Interface(SETTLEMENT_ABI);

  // Convert interactions to ABI-compatible tuples
  const interactionTuples = interactions.map((phase) =>
    phase.map((ix) => ({
      target: ix.target,
      value: ix.value.toString(),
      callData: ix.callData,
    }))
  );

  // Convert trades to ABI-compatible tuples
  const tradeTuples = trades.map((trade) => ({
    fromTokenAddressIndex: trade.fromTokenAddressIndex,
    toTokenAddressIndex: trade.toTokenAddressIndex,
    owner: trade.owner,
    receiver: trade.receiver,
    fromTokenAmount: trade.fromTokenAmount.toString(),
    toTokenAmount: trade.toTokenAmount.toString(),
    validTo: trade.validTo,
    appData: trade.appData,
    flags: trade.flags.toString(),
    executedAmount: trade.executedAmount.toString(),
    commissionInfos: trade.commissionInfos.map((ci) => ({
      feePercent: ci.feePercent.toString(),
      referrerWalletAddress: ci.referrerWalletAddress,
      flag: ci.flag.toString(),
    })),
    signature: trade.signature,
    solverFeeInfo: {
      feePercent: trade.solverFeeInfo.feePercent.toString(),
      solverAddr: trade.solverFeeInfo.solverAddr,
      flag: trade.solverFeeInfo.flag.toString(),
    },
  }));

  const surplusTuple = {
    feePercent: surplusFeeInfo.feePercent.toString(),
    trimReceiver: surplusFeeInfo.trimReceiver,
    flag: surplusFeeInfo.flag.toString(),
  };

  const calldata = iface.encodeFunctionData('settle', [
    settleId.toString(),
    tokens,
    clearingPrices.map((p) => p.toString()),
    tradeTuples,
    interactionTuples,
    surplusTuple,
  ]);

  return {
    calldata,
    params: {
      settleId,
      tokens,
      clearingPrices,
      trades,
      interactions,
      surplusFeeInfo,
    },
  };
}
