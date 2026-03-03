/**
 * EIP-712 configuration for order signing
 */

import type { SupportedChainId } from './chains';
import { getSettlementAddress } from './contracts';

/**
 * EIP-712 domain separator parameters
 */
export const EIP712_DOMAIN_NAME = 'OKX Intent Swap';
export const EIP712_DOMAIN_VERSION = 'v1.0.0';

/**
 * EIP-712 type definitions for Order
 */
export const EIP712_ORDER_TYPES = {
  Order: [
    { name: 'fromTokenAddress', type: 'address' },
    { name: 'toTokenAddress', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'fromTokenAmount', type: 'uint256' },
    { name: 'toTokenAmount', type: 'uint256' },
    { name: 'validTo', type: 'uint32' },
    { name: 'appData', type: 'bytes32' },
    { name: 'swapMode', type: 'bytes32' },
    { name: 'partiallyFillable', type: 'bool' },
    { name: 'commissionInfos', type: 'CommissionInfo[]' },
  ],
  CommissionInfo: [
    { name: 'feePercent', type: 'uint256' },
    { name: 'referrerWalletAddress', type: 'address' },
    { name: 'flag', type: 'uint256' },
  ],
};

/**
 * EIP-712 domain for a specific chain
 */
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/**
 * Get EIP-712 domain for a specific chain
 */
export function getEIP712Domain(
  chainId: SupportedChainId,
  settlementAddress?: string
): EIP712Domain {
  const verifyingContract = settlementAddress || getSettlementAddress(chainId);

  if (!verifyingContract) {
    throw new Error(`No settlement contract address for chain ${chainId}`);
  }

  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

/**
 * EIP-712 primary type for orders
 */
export const EIP712_PRIMARY_TYPE = 'Order';

/**
 * Full EIP-712 typed data structure for orders
 */
export interface OrderTypedData {
  types: typeof EIP712_ORDER_TYPES;
  primaryType: typeof EIP712_PRIMARY_TYPE;
  domain: EIP712Domain;
  message: Record<string, unknown>;
}
