/**
 * TypeScript types for the Solver API /solve endpoint request and response.
 * These types represent the JSON wire format, NOT the on-chain struct format.
 */

// ============ Commission / Fee types (API wire format) ============

/**
 * Commission info as returned by the Solver API.
 * Contains human-readable flag fields instead of packed bitmask.
 */
export interface ApiCommissionInfo {
  /** Commission rate in 1e9 precision (decimal string) */
  feePercent: string;
  /** Commission receiver address */
  referrerWalletAddress: string;
  /** true = fromToken direction, false = toToken direction */
  feeDirection: boolean;
  /** true = ToB (Settlement pays), false = ToC (user pays) */
  toB: boolean;
  /** Commission type label: "okx" | "parent" | "child" */
  commissionType: string;
}

/**
 * Solver fee info as returned by the Solver API.
 */
export interface ApiSolverFeeInfo {
  /** Fee rate in 1e9 precision (decimal string) */
  feePercent: string;
  /** Solver address */
  solverAddress: string;
  /** true = fromToken direction, false = toToken direction */
  feeDirection: boolean;
  /** Fee amount (decimal string, informational) */
  feeAmount: string;
}

/**
 * Surplus fee info as returned by the Solver API.
 */
export interface ApiSurplusFeeInfo {
  /** Surplus fee rate in 1e9 precision (decimal string) */
  feePercent: string;
  /** Protocol fee recipient */
  trimReceiver: string;
  /** Flag value (decimal string) */
  flag: string;
}

// ============ Order types ============

/**
 * Order as included in the /solve request.
 * Contains original user order data with signatures.
 */
export interface SolveRequestOrder {
  /** Token to sell */
  fromTokenAddress: string;
  /** Token to buy */
  toTokenAddress: string;
  /** Order owner address */
  owner: string;
  /** Receiver of trade proceeds */
  receiver: string;
  /** Amount of fromToken to sell (decimal string) */
  fromTokenAmount: string;
  /** Minimum amount of toToken to receive (decimal string) */
  toTokenAmount: string;
  /** Order expiry timestamp (unix seconds) */
  validTo: number;
  /** Application-specific data (bytes32 hex) */
  appDataHash: string;
  /** Swap mode: "exactIn" or "exactOut" */
  swapMode: string;
  /** Whether order can be partially filled */
  partiallyFillable: boolean;
  /** Signing scheme: "eip712" | "ethSign" | "eip1271" | "preSign" */
  signingScheme: string;
  /** Order signature (hex string) */
  signature: string;
  /** Commission configurations from the signed order (API format) */
  commissionInfos: ApiCommissionInfo[];
}

/**
 * Order data in the /solve response — solver-determined execution parameters.
 */
export interface SolveResponseOrder {
  /** Executed fromToken amount (decimal string). Used for exactIn mode. */
  executedFromTokenAmount: string;
  /** Executed toToken amount (decimal string). Used for exactOut mode. */
  executedToTokenAmount: string;
  /** Commission configurations determined by solver */
  commissionInfos: ApiCommissionInfo[];
  /** Solver fee configuration */
  solverFeeInfo: ApiSolverFeeInfo;
}

// ============ Solution types ============

/**
 * Clearing prices keyed by token address (lowercase).
 * Values are decimal strings (may contain decimals, e.g. "0.000000001939").
 */
export type ClearingPrices = Record<string, string>;

/**
 * A single solution from the solver.
 */
export interface Solution {
  /** Clearing prices indexed by token address */
  clearingPrices: ClearingPrices;
  /** Order execution results, in same order as request orders */
  orders: SolveResponseOrder[];
  /** Surplus fee info for the entire settlement */
  surplusFeeInfo: ApiSurplusFeeInfo;
}

// ============ Top-level request / response ============

/**
 * /solve request body.
 */
export interface SolveRequest {
  /** Auction / settle ID */
  auctionId: string;
  /** Orders to settle */
  orders: SolveRequestOrder[];
}

/**
 * /solve response body.
 */
export interface SolveResponse {
  /** Solver solutions (typically one) */
  solutions: Solution[];
}
