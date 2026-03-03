/**
 * Core function: buildSettleCalldata()
 *
 * Assembles a /solve request + response into hex-encoded calldata
 * that can be sent directly to Settlement.settle() on-chain.
 */

import { ethers } from 'ethers';
import { SETTLEMENT_ABI } from '@okx-intent-swap/sdk-contracts';
import type { Interaction, Trade, CommissionInfo, SolverFeeInfo, SurplusFeeInfo } from '@okx-intent-swap/sdk-common';
import type { SolveRequest, SolveResponse } from './types.js';
import {
  collectTokenAddresses,
  buildTokenIndexMap,
  convertClearingPrices,
  buildTradeFromSolveOrders,
  convertApiSurplusFeeInfo,
  computeCustomPrices,
  buildClearingPricesFromCustomPrices,
} from './converters.js';
import type { OrderCustomPrice } from './converters.js';

/**
 * Options for buildSettleCalldata.
 */
export interface BuildSettleCalldataOptions {
  /** External interactions [pre, swap, post], defaults to [[], [], []] */
  interactions?: [Interaction[], Interaction[], Interaction[]];
  /** Solution index to use from response.solutions, defaults to 0 */
  solutionIndex?: number;
  /** Compute clearing prices from execution amounts + fees instead of using solution.clearingPrices. Defaults to true. */
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

  // Step 2: Collect trade token addresses (ordered, deduplicated)
  const tradeTokens = collectTokenAddresses(request.orders);

  // Determine if interactions are active (any phase is non-empty)
  const hasInteractions = interactions.some((phase) => phase.length > 0);

  // When interactions are present, the tokens array uses the pattern:
  //   set(tradeTokens) + list(tradeTokens)
  // The first copy (set) tracks interaction balance deltas with clearingPrice = 0.
  // The second copy (list) is used by trades with actual clearing prices.
  // Trade token indices are offset by tradeTokens.length.
  const interactionTokenOffset = hasInteractions ? tradeTokens.length : 0;
  const tokens = hasInteractions
    ? [...tradeTokens, ...tradeTokens]
    : tradeTokens;

  // Build token index map with offset applied for trade lookups
  const tradeTokenIndexMap = new Map<string, number>();
  tradeTokens.forEach((addr, idx) => {
    tradeTokenIndexMap.set(addr.toLowerCase(), idx + interactionTokenOffset);
  });

  // Step 3: Convert clearing prices for trade tokens only
  // Use un-offset indices (0-based within tradeTokens) for price computation,
  // then prepend zeros for interaction token slots.
  const tradeTokenBaseMap = buildTokenIndexMap(tradeTokens);
  let tradeClearingPrices: bigint[];
  if (options?.useComputedPrices !== false) {
    // Compute per-order custom prices from execution data + fees
    const orderCustomPrices: OrderCustomPrice[] = request.orders.map((reqOrder, i) => {
      const resOrder = solution.orders[i];
      const fromTokenIndex = tradeTokenBaseMap.get(reqOrder.fromTokenAddress.toLowerCase());
      const toTokenIndex = tradeTokenBaseMap.get(reqOrder.toTokenAddress.toLowerCase());
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

    tradeClearingPrices = buildClearingPricesFromCustomPrices(orderCustomPrices, tradeTokens.length);
  } else {
    tradeClearingPrices = convertClearingPrices(solution.clearingPrices, tradeTokens);
  }

  // Final clearing prices: [0...0 (interaction slots), tradePrices...]
  const clearingPrices = hasInteractions
    ? [...new Array<bigint>(interactionTokenOffset).fill(0n), ...tradeClearingPrices]
    : tradeClearingPrices;

  // Step 4: Build trades using offset indices, sort by toTokenAddressIndex (ascending)
  // Settlement contract requires: trades[i].toTokenAddressIndex >= trades[i-1].toTokenAddressIndex
  const trades = request.orders
    .map((reqOrder, i) => buildTradeFromSolveOrders(reqOrder, solution.orders[i], tradeTokenIndexMap))
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

// ============ Decode ============

/**
 * Result returned by decodeSettleCalldata.
 * All numeric fields use native bigint/number to match SDK conventions.
 */
export interface DecodeSettleCalldataResult {
  settleId: bigint;
  tokens: string[];
  clearingPrices: bigint[];
  trades: Trade[];
  interactions: [Interaction[], Interaction[], Interaction[]];
  surplusFeeInfo: SurplusFeeInfo;
}

/**
 * Safely converts an ethers v5 decoded value (BigNumber or number) to ethers.BigNumber.
 * ethers v5 returns `number` for small uint types (e.g. uint32) and `BigNumber` for larger ones.
 */
function toBigIntSafe(value: unknown): ethers.BigNumber {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value;
  }
  return ethers.BigNumber.from(value);
}

/**
 * Decodes hex-encoded Settlement.settle() calldata back into SDK types.
 *
 * Useful for:
 * - Verifying on-chain calldata matches expected parameters
 * - Debugging submitted transactions
 * - Round-trip validation (encode → decode → compare)
 *
 * @param calldata - Hex-encoded calldata string (0x-prefixed)
 * @returns Decoded settle parameters in SDK type format
 */
export function decodeSettleCalldata(calldata: string): DecodeSettleCalldataResult {
  const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
  const decoded = iface.decodeFunctionData('settle', calldata);

  // settleId: BigNumber → bigint
  const settleId = BigInt(decoded.settleId.toString());

  // tokens: string[] (ethers returns checksummed addresses)
  const tokens: string[] = [...decoded.tokens];

  // clearingPrices: BigNumber[] → bigint[]
  const clearingPrices: bigint[] = decoded.clearingPrices.map(
    (p: ethers.BigNumber) => BigInt(p.toString())
  );

  // trades: ABI tuples → Trade[]
  const trades: Trade[] = decoded.trades.map((t: Record<string, unknown>) => {
    const commissionInfos: CommissionInfo[] = (t.commissionInfos as Array<Record<string, unknown>>).map(
      (ci) => ({
        feePercent: BigInt(toBigIntSafe(ci.feePercent).toString()),
        referrerWalletAddress: ci.referrerWalletAddress as string,
        flag: BigInt(toBigIntSafe(ci.flag).toString()),
      })
    );

    const solverFee = t.solverFeeInfo as Record<string, unknown>;
    const solverFeeInfo: SolverFeeInfo = {
      feePercent: BigInt(toBigIntSafe(solverFee.feePercent).toString()),
      solverAddr: solverFee.solverAddr as string,
      flag: BigInt(toBigIntSafe(solverFee.flag).toString()),
    };

    return {
      fromTokenAddressIndex: toBigIntSafe(t.fromTokenAddressIndex).toNumber(),
      toTokenAddressIndex: toBigIntSafe(t.toTokenAddressIndex).toNumber(),
      owner: t.owner as string,
      receiver: t.receiver as string,
      fromTokenAmount: BigInt(toBigIntSafe(t.fromTokenAmount).toString()),
      toTokenAmount: BigInt(toBigIntSafe(t.toTokenAmount).toString()),
      validTo: toBigIntSafe(t.validTo).toNumber(),
      appData: t.appData as string,
      flags: BigInt(toBigIntSafe(t.flags).toString()),
      executedAmount: BigInt(toBigIntSafe(t.executedAmount).toString()),
      commissionInfos,
      signature: t.signature as string,
      solverFeeInfo,
    } satisfies Trade;
  });

  // interactions: 3-phase tuple → [Interaction[], Interaction[], Interaction[]]
  const interactions = decoded.interactions.map(
    (phase: Array<Record<string, unknown>>) =>
      phase.map((ix) => ({
        target: ix.target as string,
        value: BigInt((ix.value as ethers.BigNumber).toString()),
        callData: ix.callData as string,
      }))
  ) as [Interaction[], Interaction[], Interaction[]];

  // surplusFeeInfo
  const sf = decoded.surplusFeeInfo;
  const surplusFeeInfo: SurplusFeeInfo = {
    feePercent: BigInt(sf.feePercent.toString()),
    trimReceiver: sf.trimReceiver as string,
    flag: BigInt(sf.flag.toString()),
  };

  return {
    settleId,
    tokens,
    clearingPrices,
    trades,
    interactions,
    surplusFeeInfo,
  };
}
