/**
 * @okx-intent-swap/sdk-config
 * Configuration and constants for IntentSwap SDK
 */

// Chains
export {
  SupportedChainId,
  CHAIN_CONFIGS,
  getChainConfig,
  isSupportedChain,
  getSupportedChainIds,
  getMainnetChainIds,
  getTestnetChainIds,
} from './chains';

export type { ChainConfig } from './chains';

// Contracts
export {
  CONTRACT_ADDRESSES,
  getContractAddresses,
  getSettlementAddress,
  getTokenApproveProxyAddress,
  areContractsDeployed,
  getDeployedChains,
} from './contracts';

export type { ContractAddresses } from './contracts';

// EIP-712
export {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_ORDER_TYPES,
  EIP712_PRIMARY_TYPE,
  getEIP712Domain,
} from './eip712';

export type { EIP712Domain, OrderTypedData } from './eip712';
