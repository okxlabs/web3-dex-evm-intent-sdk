/**
 * @okx-intent-swap/sdk-order-signing
 * Order signing utilities for IntentSwap SDK
 */

export { OrderSigningUtils } from './OrderSigningUtils';
export type { SignOrderOptions, SigningResult } from './OrderSigningUtils';

export {
  ORDER_TYPES,
  createDomain,
  orderToEIP712Message,
  commissionInfoToMessage,
  signOrderEIP712,
  signOrderEthSign,
} from './eip712';

export {
  TYPE_HASHES,
  computeDomainSeparator,
  hashCommissionInfo,
  hashCommissionInfos,
  hashOrderStruct,
  computeOrderDigest,
} from './hash';
