/**
 * EIP-712 typed data signing utilities for IntentSwap orders
 */

import type { Adapter, CommissionInfo, Order, TypedDataDomain } from '@okx-intent-swap/sdk-common';
import { ORDER_KIND_HASH, hexToBytes } from '@okx-intent-swap/sdk-common';
import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION, EIP712_ORDER_TYPES } from '@okx-intent-swap/sdk-config';

/**
 * EIP-712 type definitions for Order signing
 * Re-exported from config for convenience
 */
export const ORDER_TYPES = EIP712_ORDER_TYPES;

/**
 * Create EIP-712 domain for a specific chain and settlement contract
 */
export function createDomain(chainId: number, settlementAddress: string): TypedDataDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: settlementAddress,
  };
}

/**
 * Convert Order to EIP-712 message format
 */
export function orderToEIP712Message(order: Order): Record<string, unknown> {
  return {
    fromTokenAddress: order.fromTokenAddress,
    toTokenAddress: order.toTokenAddress,
    receiver: order.receiver,
    fromTokenAmount: order.fromTokenAmount.toString(),
    toTokenAmount: order.toTokenAmount.toString(),
    validTo: order.validTo,
    appData: order.appData,
    swapMode: ORDER_KIND_HASH[order.swapMode],
    partiallyFillable: order.partiallyFillable,
    owner: order.owner,
    commissionInfos: order.commissionInfos.map(commissionInfoToMessage),
  };
}

/**
 * Convert CommissionInfo to EIP-712 message format
 */
export function commissionInfoToMessage(info: CommissionInfo): Record<string, unknown> {
  return {
    feePercent: info.feePercent.toString(),
    referrerWalletAddress: info.referrerWalletAddress,
    flag: info.flag.toString(),
  };
}

/**
 * Sign an order using EIP-712 typed data
 */
export async function signOrderEIP712(
  order: Order,
  chainId: number,
  settlementAddress: string,
  adapter: Adapter
): Promise<string> {
  const domain = createDomain(chainId, settlementAddress);
  const message = orderToEIP712Message(order);

  return adapter.signTypedData(domain, ORDER_TYPES, message);
}

/**
 * Sign an order using eth_sign (legacy)
 * The message is prefixed with "\x19Ethereum Signed Message:\n32" + orderDigest
 */
export async function signOrderEthSign(orderDigest: string, adapter: Adapter): Promise<string> {
  // The orderDigest is already a 32-byte hash
  // eth_sign will prefix it with "\x19Ethereum Signed Message:\n32"
  const digestBytes = hexToBytes(orderDigest);
  return adapter.signMessage(digestBytes);
}
