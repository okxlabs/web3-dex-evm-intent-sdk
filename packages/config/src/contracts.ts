/**
 * Contract addresses for IntentSwap protocol
 */

import { SupportedChainId } from './chains';

/**
 * Contract addresses per chain
 */
export interface ContractAddresses {
  /** Settlement contract address */
  settlement: string;
  /** AllowListAuthentication contract address */
  allowListAuthentication: string;
  /** TokenApproveProxy contract address */
  tokenApproveProxy: string;
}

/**
 * Contract addresses for each supported chain
 * Note: Update these addresses after deployment
 */
export const CONTRACT_ADDRESSES: Partial<Record<SupportedChainId, ContractAddresses>> = {
  [SupportedChainId.MAINNET]: {
    settlement: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
    allowListAuthentication: '0x0000000000000000000000000000000000000000',
    tokenApproveProxy: '0x0000000000000000000000000000000000000000',
  },
  [SupportedChainId.SEPOLIA]: {
    settlement: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
    allowListAuthentication: '0x0000000000000000000000000000000000000000',
    tokenApproveProxy: '0x0000000000000000000000000000000000000000',
  },
  [SupportedChainId.BSC]: {
    settlement: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
    allowListAuthentication: '0x0000000000000000000000000000000000000000',
    tokenApproveProxy: '0x0000000000000000000000000000000000000000',
  },
  [SupportedChainId.POLYGON]: {
    settlement: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
    allowListAuthentication: '0x0000000000000000000000000000000000000000',
    tokenApproveProxy: '0x0000000000000000000000000000000000000000',
  },
  [SupportedChainId.ARBITRUM]: {
    settlement: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
    allowListAuthentication: '0x0000000000000000000000000000000000000000',
    tokenApproveProxy: '0x0000000000000000000000000000000000000000',
  },
  [SupportedChainId.BASE]: {
    settlement: '0x0000000000000000000000000000000000000000', // TODO: Update after deployment
    allowListAuthentication: '0x0000000000000000000000000000000000000000',
    tokenApproveProxy: '0x0000000000000000000000000000000000000000',
  },
};

/**
 * Get contract addresses for a specific chain
 */
export function getContractAddresses(chainId: SupportedChainId): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}

/**
 * Get settlement contract address for a specific chain
 */
export function getSettlementAddress(chainId: SupportedChainId): string | undefined {
  return CONTRACT_ADDRESSES[chainId]?.settlement;
}

/**
 * Get token approve proxy address for a specific chain
 */
export function getTokenApproveProxyAddress(chainId: SupportedChainId): string | undefined {
  return CONTRACT_ADDRESSES[chainId]?.tokenApproveProxy;
}

/**
 * Check if contracts are deployed on a chain
 */
export function areContractsDeployed(chainId: SupportedChainId): boolean {
  const addresses = CONTRACT_ADDRESSES[chainId];
  if (!addresses) return false;

  return (
    addresses.settlement !== '0x0000000000000000000000000000000000000000' &&
    addresses.allowListAuthentication !== '0x0000000000000000000000000000000000000000' &&
    addresses.tokenApproveProxy !== '0x0000000000000000000000000000000000000000'
  );
}

/**
 * Get chains with deployed contracts
 */
export function getDeployedChains(): SupportedChainId[] {
  return (Object.keys(CONTRACT_ADDRESSES) as unknown as SupportedChainId[]).filter((chainId) =>
    areContractsDeployed(chainId as SupportedChainId)
  );
}
