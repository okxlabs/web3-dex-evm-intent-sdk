/**
 * Constants for IntentSwap SDK
 * These values mirror the Solidity constants in the Settlement contract
 */

/**
 * Fee denominator (1e9 precision)
 */
export const COMMISSION_DENOM = 1_000_000_000n;

/**
 * Maximum total commission (3%) in 1e9 precision (decimal 9).
 * 30_000_000 / 1_000_000_000 = 3%
 */
export const COMMISSION_MAX_TOTAL_PERCENT = 30_000_000n;

/**
 * Maximum surplus fee (50%) in 1e9 precision (decimal 9).
 */
export const SURPLUS_MAX_FEE_PERCENT = 500_000_000n;

/**
 * Maximum number of commission entries per order
 */
export const MAX_COMMISSION_ENTRIES = 3;

/**
 * Marker address for buying native ETH
 */
export const BUY_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Marker value for receiver same as owner (address(0))
 */
export const RECEIVER_SAME_AS_OWNER = '0x0000000000000000000000000000000000000000';

/**
 * Order UID length in bytes
 */
export const ORDER_UID_LENGTH = 56;

/**
 * ECDSA signature length in bytes
 */
export const ECDSA_SIGNATURE_LENGTH = 65;

/**
 * EIP-712 domain parameters
 * @deprecated Use EIP712_DOMAIN_NAME and EIP712_DOMAIN_VERSION from @okx-intent-swap/sdk-config
 */
export const EIP712_DOMAIN = {
  name: 'OKX Intent Swap',
  version: 'v1.0.0',
} as const;

/**
 * Order type hash (keccak256 of the Order struct type)
 */
export const ORDER_TYPE_HASH =
  // keccak256(
  //   "Order(address fromTokenAddress,address toTokenAddress,address owner,address receiver,uint256 fromTokenAmount,uint256 toTokenAmount,uint32 validTo,bytes32 appData,bytes32 swapMode,bool partiallyFillable,CommissionInfo[] commissionInfos)" +
  //   "CommissionInfo(uint256 feePercent,address referrerWalletAddress,uint256 flag)"
  // )
  '0xc70e289c8e7a87f3aeb5bfa5b860828276fa66d7f73bc34926b2e0383bfab574';

/**
 * CommissionInfo type hash
 */
export const COMMISSION_INFO_TYPE_HASH =
  // keccak256("CommissionInfo(uint256 feePercent,address referrerWalletAddress,uint256 flag)")
  '0x383c49be8b10b90a55f1289bd1243f7250baff231facaad7e486d2391903bf5a';

/**
 * Balance mode markers
 */
export const BalanceMode = {
  /** Standard ERC20 balance */
  ERC20: '0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9',
  /** External balance mode */
  EXTERNAL: '0xabee3b73373acd583a130924aad6dc38cfdc44ba0555ba94ce2ff63980ea0632',
  /** Internal balance mode */
  INTERNAL: '0x4ac99ace14ee0a5ef932dc609df0943ab7ac16b7583634612f8dc35a4289a6ce',
} as const;

/**
 * Default order validity duration in seconds (30 minutes)
 */
export const DEFAULT_ORDER_VALIDITY = 30 * 60;

/**
 * Zero bytes32 value
 */
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Commission label bit flags for identifying commission type
 */
/** Bit 248: OKX commission label */
export const LABEL_OKX = 1n << 248n;
/** Bit 247: Parent commission label */
export const LABEL_PARENT = 1n << 247n;
/** Bit 246: Child commission label */
export const LABEL_CHILD = 1n << 246n;
