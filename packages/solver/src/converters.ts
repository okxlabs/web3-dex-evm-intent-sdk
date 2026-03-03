/**
 * Conversion functions: Solver API wire format → on-chain struct format.
 *
 * Each converter takes an API-format object and returns the corresponding
 * on-chain struct ready for ABI encoding.
 */

import type { CommissionInfo, SolverFeeInfo, SurplusFeeInfo, Trade } from '@okx-intent-swap/sdk-common';
import { CommissionFlags as CommonCommissionFlags, COMMISSION_DENOM, encodeTradeFlags, OrderKind } from '@okx-intent-swap/sdk-common';
import type {
  ApiCommissionInfo,
  ApiSolverFeeInfo,
  ApiSurplusFeeInfo,
  SolveRequestOrder,
  SolveResponseOrder,
  ClearingPrices,
} from './types';
import {
  CommissionFlags,
  COMMISSION_TYPE_LABEL_MAP,
  SolverFeeFlags,
  SIGNING_SCHEME_MAP,
  ADDRESS_ZERO,
} from './constants';

// ============ Commission Flag Packing ============

/**
 * Packs commission direction, fund-flow and label bits into a single uint256 flag.
 *
 * Bit layout:
 *  - 255: FROM_TOKEN_COMMISSION
 *  - 254: TO_TOKEN_COMMISSION
 *  - 253: IS_TO_B
 *  - 248: LABEL_OKX
 *  - 247: LABEL_PARENT
 *  - 246: LABEL_CHILD
 *
 * @param feeDirection - true = fromToken, false = toToken
 * @param toB - true = ToB (Settlement pays), false = ToC
 * @param commissionType - "okx" | "parent" | "child" (or empty)
 */
export function packCommissionFlag(
  feeDirection: boolean,
  toB: boolean,
  commissionType: string
): bigint {
  let flag = 0n;

  if (feeDirection) {
    flag |= CommissionFlags.FROM_TOKEN_COMMISSION;
  } else {
    flag |= CommissionFlags.TO_TOKEN_COMMISSION;
  }

  if (toB) {
    flag |= CommissionFlags.IS_TO_B;
  }

  const labelBit = COMMISSION_TYPE_LABEL_MAP[commissionType];
  if (labelBit !== undefined) {
    flag |= labelBit;
  }

  return flag;
}

// ============ API → On-chain Converters ============

/**
 * Converts an API-format CommissionInfo to the on-chain CommissionInfo struct.
 */
export function convertApiCommissionInfo(api: ApiCommissionInfo): CommissionInfo {
  return {
    feePercent: BigInt(api.feePercent),
    referrerWalletAddress: api.referrerWalletAddress,
    flag: packCommissionFlag(api.feeDirection, api.toB, api.commissionType),
  };
}

/**
 * Converts an API-format SolverFeeInfo to the on-chain SolverFeeInfo struct.
 *
 * Solver fee flag packing:
 *  - Bit 255: FROM_TOKEN
 *  - Bit 254: TO_TOKEN
 */
export function convertApiSolverFeeInfo(api: ApiSolverFeeInfo): SolverFeeInfo {
  let flag = 0n;
  if (api.feeDirection) {
    flag |= SolverFeeFlags.FROM_TOKEN;
  } else {
    flag |= SolverFeeFlags.TO_TOKEN;
  }

  return {
    feePercent: BigInt(api.feePercent),
    solverAddr: api.solverAddress,
    flag,
  };
}

/**
 * Converts an API-format SurplusFeeInfo to the on-chain SurplusFeeInfo struct.
 */
export function convertApiSurplusFeeInfo(api: ApiSurplusFeeInfo): SurplusFeeInfo {
  return {
    feePercent: BigInt(api.feePercent),
    trimReceiver: api.trimReceiver,
    flag: BigInt(api.flag),
  };
}

// ============ Clearing Price Conversion ============

/**
 * Counts the number of decimal places in a decimal string.
 * e.g. "1.23" → 2, "42" → 0, "0.000001" → 6
 */
function countDecimalPlaces(value: string): number {
  const dotIndex = value.indexOf('.');
  if (dotIndex === -1) return 0;
  return value.length - dotIndex - 1;
}

/**
 * Converts a decimal string to a BigInt scaled by 10^scale.
 * e.g. ("1.23", 4) → 12300n
 */
function decimalStringToScaledBigInt(value: string, scale: number): bigint {
  const dotIndex = value.indexOf('.');
  if (dotIndex === -1) {
    // Integer — just multiply by 10^scale
    return BigInt(value) * 10n ** BigInt(scale);
  }

  const intPart = value.slice(0, dotIndex);
  const fracPart = value.slice(dotIndex + 1);
  const fracDecimals = fracPart.length;

  // Combine integer and fractional parts as a single big number
  const combined = BigInt(intPart + fracPart);
  // Scale up by (scale - fracDecimals) to reach target precision
  const remaining = scale - fracDecimals;

  if (remaining >= 0) {
    return combined * 10n ** BigInt(remaining);
  }
  // Should not happen if scale >= maxDecimals, but handle defensively
  return combined / 10n ** BigInt(-remaining);
}

/**
 * Converts API clearing prices (decimal strings) to uint256 array.
 *
 * Algorithm:
 * 1. Find max decimal places across all prices.
 * 2. Scale every price by 10^maxDecimals to get integer representation.
 * 3. Return array ordered by the provided token address list.
 *
 * @param apiPrices - Clearing prices keyed by lowercase token address
 * @param tokenAddresses - Ordered token address array (determines output order)
 * @returns uint256[] clearing prices aligned with tokenAddresses
 */
export function convertClearingPrices(
  apiPrices: ClearingPrices,
  tokenAddresses: string[]
): bigint[] {
  // Normalize keys to lowercase for lookup
  const normalizedPrices: Record<string, string> = {};
  for (const [addr, price] of Object.entries(apiPrices)) {
    normalizedPrices[addr.toLowerCase()] = price;
  }

  // Find maximum decimal places
  let maxDecimals = 0;
  for (const price of Object.values(normalizedPrices)) {
    const dec = countDecimalPlaces(price);
    if (dec > maxDecimals) {
      maxDecimals = dec;
    }
  }

  // Convert each token's price in order
  return tokenAddresses.map((addr) => {
    const price = normalizedPrices[addr.toLowerCase()];
    if (price === undefined) {
      throw new Error(`Clearing price missing for token: ${addr}`);
    }
    return decimalStringToScaledBigInt(price, maxDecimals);
  });
}

// ============ Trade Builder ============

/**
 * Resolves the API signing scheme string to its numeric value.
 */
function resolveSigningScheme(scheme: string): number {
  const value = SIGNING_SCHEME_MAP[scheme];
  if (value === undefined) {
    throw new Error(`Unknown signing scheme: ${scheme}`);
  }
  return value;
}

/**
 * Resolves the API swap mode string to OrderKind enum.
 */
function resolveSwapMode(mode: string): OrderKind {
  if (mode === 'exactIn') return OrderKind.EXACT_IN;
  if (mode === 'exactOut') return OrderKind.EXACT_OUT;
  throw new Error(`Unknown swap mode: ${mode}`);
}

/**
 * Builds a single on-chain Trade struct from request + response order data.
 *
 * @param reqOrder - Original order from /solve request
 * @param resOrder - Solver-determined execution data from /solve response
 * @param tokenIndexMap - Map of lowercase token address → index in tokens array
 */
export function buildTradeFromSolveOrders(
  reqOrder: SolveRequestOrder,
  resOrder: SolveResponseOrder,
  tokenIndexMap: Map<string, number>
): Trade {
  const fromTokenIndex = tokenIndexMap.get(reqOrder.fromTokenAddress.toLowerCase());
  const toTokenIndex = tokenIndexMap.get(reqOrder.toTokenAddress.toLowerCase());

  if (fromTokenIndex === undefined) {
    throw new Error(`fromToken not found in tokens array: ${reqOrder.fromTokenAddress}`);
  }
  if (toTokenIndex === undefined) {
    throw new Error(`toToken not found in tokens array: ${reqOrder.toTokenAddress}`);
  }

  const swapMode = resolveSwapMode(reqOrder.swapMode);
  const signingScheme = resolveSigningScheme(reqOrder.signingScheme);
  const flags = encodeTradeFlags(swapMode, reqOrder.partiallyFillable, signingScheme);

  // For exactIn, executedAmount = executedFromTokenAmount
  // For exactOut, executedAmount = executedToTokenAmount
  const executedAmount =
    swapMode === OrderKind.EXACT_IN
      ? BigInt(resOrder.executedFromTokenAmount)
      : BigInt(resOrder.executedToTokenAmount);

  // If receiver === owner, use address(0) per protocol convention
  const receiver =
    reqOrder.receiver.toLowerCase() === reqOrder.owner.toLowerCase()
      ? ADDRESS_ZERO
      : reqOrder.receiver;

  // Convert commission infos from response (solver-determined)
  const commissionInfos = resOrder.commissionInfos.map(convertApiCommissionInfo);

  // Convert solver fee info
  const solverFeeInfo = convertApiSolverFeeInfo(resOrder.solverFeeInfo);

  return {
    fromTokenAddressIndex: fromTokenIndex,
    toTokenAddressIndex: toTokenIndex,
    owner: reqOrder.owner,
    receiver,
    fromTokenAmount: BigInt(reqOrder.fromTokenAmount),
    toTokenAmount: BigInt(reqOrder.toTokenAmount),
    validTo: reqOrder.validTo,
    appData: reqOrder.appDataHash,
    flags,
    executedAmount,
    commissionInfos,
    signature: reqOrder.signature,
    solverFeeInfo,
  };
}

// ============ Token Collection ============

/**
 * Collects all unique token addresses from request orders, preserving insertion order.
 * Returns lowercase-normalized addresses.
 */
export function collectTokenAddresses(orders: SolveRequestOrder[]): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const order of orders) {
    const from = order.fromTokenAddress.toLowerCase();
    const to = order.toTokenAddress.toLowerCase();

    if (!seen.has(from)) {
      seen.add(from);
      tokens.push(from);
    }
    if (!seen.has(to)) {
      seen.add(to);
      tokens.push(to);
    }
  }

  return tokens;
}

/**
 * Builds a lookup map from token address (lowercase) → index.
 */
export function buildTokenIndexMap(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  tokens.forEach((addr, idx) => {
    map.set(addr.toLowerCase(), idx);
  });
  return map;
}

// ============ Custom Price Computation ============

/**
 * Result of computing custom clearing prices for a single order.
 */
export interface CustomPriceResult {
  /** P_s = clearingPrices[fromTokenIndex] */
  customPriceSell: bigint;
  /** P_b = clearingPrices[toTokenIndex] */
  customPriceBuy: bigint;
  /** Total fromToken fees (0 if toToken direction) */
  fromTokenFee: bigint;
  /** Total toToken fees (0 if fromToken direction) */
  toTokenFee: bigint;
}

/**
 * Determines the fee direction from commission infos and solver fee info.
 * Returns 'from' if all fees are fromToken, 'to' if all toToken, 'none' if no fees.
 * Throws if fees have mixed directions.
 */
function determineFeeDirection(
  commissionInfos: ApiCommissionInfo[],
  solverFeeInfo: ApiSolverFeeInfo
): 'from' | 'to' | 'none' {
  let hasFrom = false;
  let hasTo = false;

  for (const ci of commissionInfos) {
    if (BigInt(ci.feePercent) === 0n) continue;
    if (ci.feeDirection) {
      hasFrom = true;
    } else {
      hasTo = true;
    }
  }

  if (BigInt(solverFeeInfo.feePercent) > 0n) {
    if (solverFeeInfo.feeDirection) {
      hasFrom = true;
    } else {
      hasTo = true;
    }
  }

  if (hasFrom && hasTo) {
    throw new Error('Mixed fee directions: all fees must be in the same direction (fromToken or toToken)');
  }
  if (hasFrom) return 'from';
  if (hasTo) return 'to';
  return 'none';
}

/**
 * Computes custom clearing prices for a single order from execution amounts and fee info.
 *
 * Aligns with Settlement.sol:258-275 logic:
 *   netFromForSwap = fromGross - fromTokenFee
 *   toGross = ceil(netFromForSwap * P_s / P_b)
 *   userPayout = toGross - toTokenFee
 *
 * We choose P_s and P_b such that:
 *   - fromToken direction: P_s = eB, P_b = eS - fromTokenFee
 *   - toToken direction: P_s = toGross (computed), P_b = eS
 *   - no fees: P_s = eB, P_b = eS
 *
 * Fee calculation follows FeeLib.sol: fee_i = floor(base * feePercent_i / COMMISSION_DENOM)
 *
 * @param executedSellAmount - Executed sell amount (eS = fromGross)
 * @param executedBuyAmount - Executed buy amount (eB = user payout)
 * @param commissionInfos - Commission fee entries (API format)
 * @param solverFeeInfo - Solver fee entry (API format)
 */
export function computeCustomPrices(
  executedSellAmount: bigint,
  executedBuyAmount: bigint,
  commissionInfos: ApiCommissionInfo[],
  solverFeeInfo: ApiSolverFeeInfo
): CustomPriceResult {
  const direction = determineFeeDirection(commissionInfos, solverFeeInfo);

  if (direction === 'none') {
    // No fees: P_s = eB, P_b = eS
    return {
      customPriceSell: executedBuyAmount,
      customPriceBuy: executedSellAmount,
      fromTokenFee: 0n,
      toTokenFee: 0n,
    };
  }

  if (direction === 'from') {
    // fromToken fees: base = eS (fromGross)
    // FeeLib.sol:69, FeeLib.sol:101 — fee_i = floor(eS * feePercent_i / COMMISSION_DENOM)
    let fromTokenFee = 0n;
    for (const ci of commissionInfos) {
      const pct = BigInt(ci.feePercent);
      if (pct > 0n) {
        fromTokenFee += (executedSellAmount * pct) / COMMISSION_DENOM;
      }
    }
    const solverPct = BigInt(solverFeeInfo.feePercent);
    if (solverPct > 0n) {
      fromTokenFee += (executedSellAmount * solverPct) / COMMISSION_DENOM;
    }

    // P_s = eB, P_b = eS - fromTokenFee
    return {
      customPriceSell: executedBuyAmount,
      customPriceBuy: executedSellAmount - fromTokenFee,
      fromTokenFee,
      toTokenFee: 0n,
    };
  }

  // toToken fees: base = toGross, toGross - toTokenFee >= eB
  // Circular dependency: toGross depends on fees which depend on toGross.
  // Approximation: toGross ≈ floor(eB * COMMISSION_DENOM / (COMMISSION_DENOM - totalToPercent))
  let totalToPercent = 0n;
  for (const ci of commissionInfos) {
    const pct = BigInt(ci.feePercent);
    if (pct > 0n) {
      totalToPercent += pct;
    }
  }
  const solverPct = BigInt(solverFeeInfo.feePercent);
  if (solverPct > 0n) {
    totalToPercent += solverPct;
  }

  let toGross = (executedBuyAmount * COMMISSION_DENOM) / (COMMISSION_DENOM - totalToPercent);

  // Compute actual fees from toGross, then adjust if needed
  const computeToTokenFee = (gross: bigint): bigint => {
    let fee = 0n;
    for (const ci of commissionInfos) {
      const pct = BigInt(ci.feePercent);
      if (pct > 0n) {
        fee += (gross * pct) / COMMISSION_DENOM;
      }
    }
    if (solverPct > 0n) {
      fee += (gross * solverPct) / COMMISSION_DENOM;
    }
    return fee;
  };

  // Increment toGross until toGross - toTokenFee >= eB (handles rounding)
  let toTokenFee = computeToTokenFee(toGross);
  while (toGross - toTokenFee < executedBuyAmount) {
    toGross += 1n;
    toTokenFee = computeToTokenFee(toGross);
  }

  // P_s = toGross, P_b = eS
  return {
    customPriceSell: toGross,
    customPriceBuy: executedSellAmount,
    fromTokenFee: 0n,
    toTokenFee,
  };
}

/**
 * Per-order custom price entry for building the global clearingPrices array.
 */
export interface OrderCustomPrice {
  /** Index of fromToken in the global tokens array */
  fromTokenIndex: number;
  /** Index of toToken in the global tokens array */
  toTokenIndex: number;
  /** Custom price result from computeCustomPrices */
  prices: CustomPriceResult;
}

/**
 * Builds the global clearingPrices[] array from per-order custom prices.
 *
 * Writes P_s to clearingPrices[fromTokenIndex] and P_b to clearingPrices[toTokenIndex].
 * Throws if the same token index is assigned different prices by different orders.
 *
 * @param orderPrices - Per-order custom price entries
 * @param tokenCount - Total number of unique tokens
 */
export function buildClearingPricesFromCustomPrices(
  orderPrices: OrderCustomPrice[],
  tokenCount: number
): bigint[] {
  const clearingPrices = new Array<bigint | undefined>(tokenCount).fill(undefined);

  for (let i = 0; i < orderPrices.length; i++) {
    const { fromTokenIndex, toTokenIndex, prices } = orderPrices[i];

    // Assign P_s to fromTokenIndex
    if (clearingPrices[fromTokenIndex] !== undefined) {
      if (clearingPrices[fromTokenIndex] !== prices.customPriceSell) {
        throw new Error(
          `Token index ${fromTokenIndex} has conflicting clearing prices: ` +
          `${clearingPrices[fromTokenIndex]} vs ${prices.customPriceSell} (order ${i})`
        );
      }
    } else {
      clearingPrices[fromTokenIndex] = prices.customPriceSell;
    }

    // Assign P_b to toTokenIndex
    if (clearingPrices[toTokenIndex] !== undefined) {
      if (clearingPrices[toTokenIndex] !== prices.customPriceBuy) {
        throw new Error(
          `Token index ${toTokenIndex} has conflicting clearing prices: ` +
          `${clearingPrices[toTokenIndex]} vs ${prices.customPriceBuy} (order ${i})`
        );
      }
    } else {
      clearingPrices[toTokenIndex] = prices.customPriceBuy;
    }
  }

  // Verify all token indices have been assigned
  for (let i = 0; i < tokenCount; i++) {
    if (clearingPrices[i] === undefined) {
      throw new Error(`Token index ${i} has no clearing price assigned`);
    }
  }

  return clearingPrices as bigint[];
}
