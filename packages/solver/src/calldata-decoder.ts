/**
 * Reconstructs SolveRequest, SolveResponse, and interactions from calldata.
 *
 * Reverse-engineers the on-chain ABI-encoded settle() calldata back to
 * API-level types (SolveRequest, SolveResponse, interactions).
 *
 * Assumes calldata was produced with useComputedPrices=true (SDK default).
 */

import type { Interaction, CommissionInfo, SolverFeeInfo, Trade } from '@okx-intent-swap/sdk-common';
import {
  decodeTradeFlags,
  CommissionFlags,
  COMMISSION_DENOM,
  LABEL_OKX,
  LABEL_PARENT,
  LABEL_CHILD,
} from '@okx-intent-swap/sdk-common';
import type {
  SolveRequest,
  SolveResponse,
  SolveRequestOrder,
  SolveResponseOrder,
  ApiCommissionInfo,
  ApiSolverFeeInfo,
} from './types.js';
import { SolverFeeFlags, ADDRESS_ZERO, SIGNING_SCHEME_MAP } from './constants.js';
import { decodeSettleCalldata } from './calldata-builder.js';

// ============ Flag Unpacking ============

/** Reverse map: signingScheme number → API string */
const SIGNING_SCHEME_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(SIGNING_SCHEME_MAP).map(([k, v]) => [v, k])
);

/**
 * Unpacks the on-chain commission flag bitmask back to API-level fields.
 *
 * Reverses packCommissionFlag(): extracts direction, toB, and commissionType
 * from the packed uint256 bitmask.
 */
export function unpackCommissionFlag(flag: bigint): {
  feeDirection: boolean;
  toB: boolean;
  commissionType: string;
} {
  const feeDirection = (flag & CommissionFlags.FROM_TOKEN_COMMISSION) !== 0n;
  const toB = (flag & CommissionFlags.IS_TO_B) !== 0n;

  let commissionType = '';
  if ((flag & LABEL_OKX) !== 0n) commissionType = 'okx';
  else if ((flag & LABEL_PARENT) !== 0n) commissionType = 'parent';
  else if ((flag & LABEL_CHILD) !== 0n) commissionType = 'child';

  return { feeDirection, toB, commissionType };
}

/**
 * Unpacks the on-chain solver fee flag to feeDirection.
 */
export function unpackSolverFeeFlag(flag: bigint): boolean {
  return (flag & SolverFeeFlags.FROM_TOKEN) !== 0n;
}

/**
 * Converts on-chain CommissionInfo to API-level ApiCommissionInfo.
 */
function toApiCommissionInfo(ci: CommissionInfo): ApiCommissionInfo {
  const { feeDirection, toB, commissionType } = unpackCommissionFlag(ci.flag);
  return {
    feePercent: ci.feePercent.toString(),
    referrerWalletAddress: ci.referrerWalletAddress,
    feeDirection,
    toB,
    commissionType,
  };
}

/**
 * Converts on-chain SolverFeeInfo to API-level ApiSolverFeeInfo.
 * feeAmount defaults to '0' since the exact value is not stored in calldata.
 */
function toApiSolverFeeInfo(info: SolverFeeInfo): ApiSolverFeeInfo {
  return {
    feePercent: info.feePercent.toString(),
    solverAddress: info.solverAddr,
    feeDirection: unpackSolverFeeFlag(info.flag),
    feeAmount: '0',
  };
}

// ============ Executed Amount Recovery ============

/**
 * Determines aggregate fee direction from unpacked commission infos + solver fee.
 */
function determineFeeDirection(
  commissionInfos: ApiCommissionInfo[],
  solverFeeInfo: { feePercent: string; feeDirection: boolean }
): 'from' | 'to' | 'none' {
  let hasFrom = false;
  let hasTo = false;

  for (const ci of commissionInfos) {
    if (BigInt(ci.feePercent) === 0n) continue;
    if (ci.feeDirection) hasFrom = true;
    else hasTo = true;
  }
  if (BigInt(solverFeeInfo.feePercent) > 0n) {
    if (solverFeeInfo.feeDirection) hasFrom = true;
    else hasTo = true;
  }

  if (hasFrom && hasTo) return 'from';
  if (hasFrom) return 'from';
  if (hasTo) return 'to';
  return 'none';
}

/**
 * Computes total fee amount from a base amount and fee entries.
 * Mirrors FeeLib.sol: fee_i = floor(base * feePercent_i / COMMISSION_DENOM)
 */
function computeTotalFee(
  base: bigint,
  commissionInfos: ApiCommissionInfo[],
  solverFeePercent: bigint
): bigint {
  let total = 0n;
  for (const ci of commissionInfos) {
    const pct = BigInt(ci.feePercent);
    if (pct > 0n) {
      total += (base * pct) / COMMISSION_DENOM;
    }
  }
  if (solverFeePercent > 0n) {
    total += (base * solverFeePercent) / COMMISSION_DENOM;
  }
  return total;
}

/**
 * Recovers executedFromTokenAmount and executedToTokenAmount from on-chain data.
 *
 * Assumes calldata was produced with useComputedPrices=true (SDK default).
 *
 * For exactIn (executedAmount = eS):
 *   - fromToken fees: eB = P_s = clearingPrices[fromTokenIndex]
 *   - toToken fees:   toGross = P_s, eB = toGross - toTokenFee
 *   - no fees:        eB = P_s
 *
 * For exactOut (executedAmount = eB):
 *   - Similar reverse logic using P_b
 */
function recoverExecutedAmounts(
  trade: Trade,
  clearingPrices: bigint[],
  apiCommissionInfos: ApiCommissionInfo[],
  solverFeePercent: bigint
): { executedFromTokenAmount: bigint; executedToTokenAmount: bigint } {
  const { swapMode } = decodeTradeFlags(trade.flags);
  const direction = determineFeeDirection(apiCommissionInfos, {
    feePercent: solverFeePercent.toString(),
    feeDirection: unpackSolverFeeFlag(trade.solverFeeInfo.flag),
  });

  const P_s = clearingPrices[trade.fromTokenAddressIndex];
  const P_b = clearingPrices[trade.toTokenAddressIndex];

  if (swapMode === 'exactIn') {
    const eS = trade.executedAmount;
    let eB: bigint;

    if (direction === 'from' || direction === 'none') {
      eB = P_s;
    } else {
      const toGross = P_s;
      const toTokenFee = computeTotalFee(toGross, apiCommissionInfos, solverFeePercent);
      eB = toGross - toTokenFee;
    }

    return { executedFromTokenAmount: eS, executedToTokenAmount: eB };
  }

  // exactOut: executedAmount = eB
  const eB = trade.executedAmount;
  let eS: bigint;

  if (direction === 'to' || direction === 'none') {
    eS = P_b;
  } else {
    let totalPct = 0n;
    for (const ci of apiCommissionInfos) {
      totalPct += BigInt(ci.feePercent);
    }
    totalPct += solverFeePercent;
    eS = (P_b * COMMISSION_DENOM + (COMMISSION_DENOM - totalPct) - 1n) / (COMMISSION_DENOM - totalPct);
  }

  return { executedFromTokenAmount: eS, executedToTokenAmount: eB };
}

// ============ Public API ============

/**
 * Result of reconstructing API-level objects from calldata.
 */
export interface ReconstructFromCalldataResult {
  request: SolveRequest;
  response: SolveResponse;
  interactions: [Interaction[], Interaction[], Interaction[]];
}

/**
 * Reconstructs SolveRequest, SolveResponse, and interactions from calldata.
 *
 * This is the inverse of buildSettleCalldata(). Given only the hex-encoded calldata,
 * it recovers the original API-level request/response objects by:
 * 1. ABI-decoding the calldata via decodeSettleCalldata()
 * 2. Unpacking packed flag bitmasks → feeDirection, toB, commissionType
 * 3. Decoding trade flags → swapMode, partiallyFillable, signingScheme
 * 4. Recovering executedBuyAmount from clearing prices + fee computation
 * 5. Restoring receiver (address(0) → owner)
 *
 * Limitations:
 * - Assumes useComputedPrices=true was used during encoding (SDK default)
 * - clearingPrices in response are on-chain uint256 values, not original decimal strings
 * - commissionInfos.feeAmount is re-computed, not the original API value
 * - Addresses are checksummed (ethers decode format), not lowercase
 *
 * @param calldata - Hex-encoded Settlement.settle() calldata (0x-prefixed)
 * @returns Reconstructed request, response, and interactions
 */
export function reconstructFromCalldata(calldata: string): ReconstructFromCalldataResult {
  const decoded = decodeSettleCalldata(calldata);

  const requestOrders: SolveRequestOrder[] = [];
  const responseOrders: SolveResponseOrder[] = [];

  for (const trade of decoded.trades) {
    const { swapMode, partiallyFillable, signingScheme } = decodeTradeFlags(trade.flags);

    const fromTokenAddress = decoded.tokens[trade.fromTokenAddressIndex];
    const toTokenAddress = decoded.tokens[trade.toTokenAddressIndex];

    // Restore receiver: address(0) means receiver === owner
    const receiver =
      trade.receiver === ADDRESS_ZERO ? trade.owner : trade.receiver;

    const apiCommissionInfos = trade.commissionInfos.map(toApiCommissionInfo);
    const apiSolverFeeInfo = toApiSolverFeeInfo(trade.solverFeeInfo);
    const solverFeePercent = trade.solverFeeInfo.feePercent;

    // Recover executed amounts from clearing prices + fees
    const { executedFromTokenAmount, executedToTokenAmount } = recoverExecutedAmounts(
      trade,
      decoded.clearingPrices,
      apiCommissionInfos,
      solverFeePercent
    );

    // Compute solver feeAmount
    const direction = determineFeeDirection(apiCommissionInfos, apiSolverFeeInfo);
    const feeBase =
      direction === 'to'
        ? decoded.clearingPrices[trade.fromTokenAddressIndex]
        : executedFromTokenAmount;
    const solverFeeAmount =
      solverFeePercent > 0n ? (feeBase * solverFeePercent) / COMMISSION_DENOM : 0n;

    requestOrders.push({
      fromTokenAddress,
      toTokenAddress,
      owner: trade.owner,
      receiver,
      fromTokenAmount: trade.fromTokenAmount.toString(),
      toTokenAmount: trade.toTokenAmount.toString(),
      validTo: trade.validTo,
      appDataHash: trade.appData,
      swapMode,
      partiallyFillable,
      signingScheme: SIGNING_SCHEME_REVERSE[signingScheme] ?? `unknown(${signingScheme})`,
      signature: trade.signature,
      commissionInfos: apiCommissionInfos,
    });

    responseOrders.push({
      executedFromTokenAmount: executedFromTokenAmount.toString(),
      executedToTokenAmount: executedToTokenAmount.toString(),
      commissionInfos: apiCommissionInfos.map((ci) => ({ ...ci })),
      solverFeeInfo: {
        ...apiSolverFeeInfo,
        feeAmount: solverFeeAmount.toString(),
      },
    });
  }

  // Build clearingPrices map (on-chain uint256 values, not original decimal strings)
  const clearingPricesMap: Record<string, string> = {};
  decoded.tokens.forEach((token, i) => {
    clearingPricesMap[token.toLowerCase()] = decoded.clearingPrices[i].toString();
  });

  return {
    request: {
      auctionId: decoded.settleId.toString(),
      orders: requestOrders,
    },
    response: {
      solutions: [
        {
          clearingPrices: clearingPricesMap,
          orders: responseOrders,
          surplusFeeInfo: {
            feePercent: decoded.surplusFeeInfo.feePercent.toString(),
            trimReceiver: decoded.surplusFeeInfo.trimReceiver,
            flag: decoded.surplusFeeInfo.flag.toString(),
          },
        },
      ],
    },
    interactions: decoded.interactions,
  };
}
