/**
 * @okx-intent-swap/sdk-common
 * Common types and utilities for IntentSwap SDK
 */

// Types
export type {
  Order,
  OrderForSigning,
  CommissionInfo,
  CommissionInfoForSigning,
  SolverFeeInfo,
  Trade,
  SignedOrder,
  OrderParameters,
  Interaction,
  Transfer,
  SurplusFeeInfo,
} from './types';

export { OrderKind, SigningScheme, CommissionFlags, ORDER_KIND_HASH } from './types';

// Constants
export {
  COMMISSION_DENOM,
  COMMISSION_MAX_TOTAL_PERCENT,
  SURPLUS_MAX_FEE_PERCENT,
  MAX_COMMISSION_ENTRIES,
  BUY_ETH_ADDRESS,
  RECEIVER_SAME_AS_OWNER,
  ORDER_UID_LENGTH,
  ECDSA_SIGNATURE_LENGTH,
  EIP712_DOMAIN,
  ORDER_TYPE_HASH,
  COMMISSION_INFO_TYPE_HASH,
  BalanceMode,
  DEFAULT_ORDER_VALIDITY,
  ZERO_BYTES32,
  LABEL_OKX,
  LABEL_PARENT,
  LABEL_CHILD,
} from './constants';

// Utilities
export {
  hexToBytes,
  bytesToHex,
  packOrderUid,
  extractOrderUidParams,
  getActualReceiver,
  orderToSigningFormat,
  commissionInfoToSigningFormat,
  isValidAddress,
  isValidBytes32,
  encodeTradeFlags,
  decodeTradeFlags,
  validateCommissionInfo,
  validateOrder,
  normalizeAddress,
  isOrderExpired,
  getCurrentTimestamp,
} from './utils';

// Adapter
export type {
  TypedDataDomain,
  TypedDataField,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Log,
  Adapter,
} from './adapter';

export { setGlobalAdapter, getGlobalAdapter, clearGlobalAdapter } from './adapter';
