/**
 * Core types for IntentSwap SDK
 * These types mirror the Solidity structs in the Settlement contract
 */

/**
 * Swap mode
 */
export enum OrderKind {
  EXACT_IN = 'exactIn',
  EXACT_OUT = 'exactOut',
}

/**
 * Swap mode as bytes32 hash (matching Solidity constants)
 * keccak256("exactIn") / keccak256("exactOut")
 */
export const ORDER_KIND_HASH = {
  [OrderKind.EXACT_IN]: '0x39124995febcd74fadbdf9bbad44826dab79bc9478b4965fd0d2381c0d649b2c',
  [OrderKind.EXACT_OUT]: '0x337dffe7a8a1d2fde4a7e8b7b4c2bb192c36934de29e14c41ea54bf9632b50b6',
} as const;

/**
 * Signing scheme used for order validation
 */
export enum SigningScheme {
  /**
   * EIP-712 typed data signing
   */
  EIP712 = 0,
  /**
   * eth_sign message signing
   */
  ETH_SIGN = 1,
  /**
   * EIP-1271 smart contract signature
   */
  EIP1271 = 2,
  /**
   * Pre-signed order stored on-chain
   */
  PRE_SIGN = 3,
}

/**
 * Commission info flags - bit positions
 */
export const CommissionFlags = {
  /** Bit 255: Commission is taken from fromToken */
  FROM_TOKEN_COMMISSION: 1n << 255n,
  /** Bit 254: Commission is taken from toToken */
  TO_TOKEN_COMMISSION: 1n << 254n,
  /** Bit 253: ToB mode - Settlement pays fees instead of user */
  IS_TO_B: 1n << 253n,
} as const;

/**
 * Commission configuration signed by the user as part of the order
 * Mirrors OrderLib.CommissionInfo
 */
export interface CommissionInfo {
  /** Commission rate in 1e9 precision (decimal 9). Max 3% total per order */
  feePercent: bigint;
  /** Commission receiver address */
  referrerWalletAddress: string;
  /** Compact bitmask (direction + fund-flow + offchain labels) */
  flag: bigint;
}

/**
 * Complete order data structure
 * Mirrors OrderLib.Data
 */
export interface Order {
  /** Token to sell */
  fromTokenAddress: string;
  /** Token to buy */
  toTokenAddress: string;
  /** Receiver of trade proceeds (address(0) = same as owner) */
  receiver: string;
  /** Amount of fromToken to sell */
  fromTokenAmount: bigint;
  /** Minimum amount of toToken to receive */
  toTokenAmount: bigint;
  /** Order expiry timestamp (unix seconds) */
  validTo: number;
  /** Application-specific data (bytes32) */
  appData: string;
  /** Swap mode (exactIn only in current protocol) */
  swapMode: OrderKind;
  /** Whether order can be partially filled */
  partiallyFillable: boolean;
  /**
   * Declared owner of the order.
   *
   * - For EOA signing schemes, this may be set to the signer address (recommended) or the zero address.
   * - For EIP-1271, this MUST be set to the smart contract wallet address.
   */
  owner: string;
  /** Commission configurations */
  commissionInfos: CommissionInfo[];
}

/**
 * Order with EIP-712 typed data format for signing
 */
export interface OrderForSigning {
  fromTokenAddress: string;
  toTokenAddress: string;
  receiver: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  validTo: number;
  appData: string;
  swapMode: string;
  partiallyFillable: boolean;
  owner: string;
  commissionInfos: CommissionInfoForSigning[];
}

/**
 * CommissionInfo with string format for EIP-712 signing
 */
export interface CommissionInfoForSigning {
  feePercent: string;
  referrerWalletAddress: string;
  flag: string;
}

/**
 * Solver fee configuration
 * Mirrors TradeLib.SolverFeeInfo
 */
export interface SolverFeeInfo {
  /** Fee rate in 1e9 precision (decimal 9) */
  feePercent: bigint;
  /** Solver address */
  solverAddr: string;
  /** Direction + fund-flow flag */
  flag: bigint;
}

/**
 * Trade data for batch settlement
 * Mirrors TradeLib.Data
 */
export interface Trade {
  /** Index of fromToken in tokens array */
  fromTokenAddressIndex: number;
  /** Index of toToken in tokens array */
  toTokenAddressIndex: number;
  /** Declared owner of the order */
  owner: string;
  /** Receiver of trade proceeds */
  receiver: string;
  /** Amount of fromToken */
  fromTokenAmount: bigint;
  /** Amount of toToken */
  toTokenAmount: bigint;
  /** Order expiry timestamp */
  validTo: number;
  /** Application-specific data */
  appData: string;
  /** Encoded flags (swapMode, partiallyFillable, signingScheme) */
  flags: bigint;
  /** Executed amount for partial fills */
  executedAmount: bigint;
  /** Commission configurations */
  commissionInfos: CommissionInfo[];
  /** Order signature */
  signature: string;
  /** Solver fee configuration */
  solverFeeInfo: SolverFeeInfo;
}

/**
 * Signed order with signature and UID
 */
export interface SignedOrder {
  /** The order data */
  order: Order;
  /** Order signature */
  signature: string;
  /** Signing scheme used */
  signingScheme: SigningScheme;
  /** Order unique identifier (56 bytes) */
  uid: string;
  /** Order digest (EIP-712 hash) */
  orderDigest: string;
  /** Owner address (recovered from signature) */
  owner: string;
}

/**
 * Order parameters for creating a new order
 */
export interface OrderParameters {
  /** Token to sell */
  fromTokenAddress: string;
  /** Token to buy */
  toTokenAddress: string;
  /** Receiver of trade proceeds (optional, defaults to signer) */
  receiver?: string;
  /** Amount of fromToken to sell */
  fromTokenAmount: bigint;
  /** Minimum amount of toToken to receive */
  toTokenAmount: bigint;
  /** Order expiry timestamp (optional, defaults to 30 minutes) */
  validTo?: number;
  /** Application-specific data (optional) */
  appData?: string;
  /** Swap mode (optional, defaults to exactIn) */
  swapMode?: OrderKind;
  /** Whether order can be partially filled (optional, defaults to false) */
  partiallyFillable?: boolean;
  /**
   * Declared owner of the order (optional).
   *
   * - If omitted, defaults to the connected signer address.
   * - For EIP-1271 orders, you should set this to the smart contract wallet address.
   */
  owner?: string;
  /** Commission configurations (optional) */
  commissionInfos?: CommissionInfo[];
}

/**
 * Interaction for external calls during settlement
 * Mirrors InteractionLib.Data
 */
export interface Interaction {
  /** Target contract address */
  target: string;
  /** ETH value to send */
  value: bigint;
  /** Calldata to execute */
  callData: string;
}

/**
 * Transfer data
 * Mirrors TransferLib.Data
 */
export interface Transfer {
  /** Account address */
  account: string;
  /** Token address */
  token: string;
  /** Amount to transfer */
  amount: bigint;
}

/**
 * Surplus fee distribution configuration
 * Mirrors SettlementTypes.SurplusFeeInfo
 */
export interface SurplusFeeInfo {
  /** Surplus fee rate (max 50%) */
  feePercent: bigint;
  /** Protocol fee recipient */
  trimReceiver: string;
  /** Flag */
  flag: bigint;
}
