/**
 * Supported chain IDs for IntentSwap SDK
 */

export enum SupportedChainId {
  /** Ethereum Mainnet */
  MAINNET = 1,
  /** Goerli Testnet */
  GOERLI = 5,
  /** Local Anvil (Foundry) */
  ANVIL = 31337,
  /** Sepolia Testnet */
  SEPOLIA = 11155111,
  /** BNB Smart Chain */
  BSC = 56,
  /** Polygon */
  POLYGON = 137,
  /** Arbitrum One */
  ARBITRUM = 42161,
  /** Optimism */
  OPTIMISM = 10,
  /** Base */
  BASE = 8453,
  /** Avalanche C-Chain */
  AVALANCHE = 43114,
  /** Gnosis Chain */
  GNOSIS = 100,
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  /** Chain ID */
  chainId: SupportedChainId;
  /** Chain name */
  name: string;
  /** Native currency symbol */
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  /** RPC URL (default) */
  rpcUrl?: string;
  /** Block explorer URL */
  explorerUrl?: string;
  /** Whether this is a testnet */
  isTestnet: boolean;
}

/**
 * Chain configurations for supported networks
 */
export const CHAIN_CONFIGS: Record<SupportedChainId, ChainConfig> = {
  [SupportedChainId.MAINNET]: {
    chainId: SupportedChainId.MAINNET,
    name: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  [SupportedChainId.GOERLI]: {
    chainId: SupportedChainId.GOERLI,
    name: 'Goerli',
    nativeCurrency: { name: 'Goerli Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://goerli.etherscan.io',
    isTestnet: true,
  },
  [SupportedChainId.ANVIL]: {
    chainId: SupportedChainId.ANVIL,
    name: 'Anvil (Local)',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: true,
  },
  [SupportedChainId.SEPOLIA]: {
    chainId: SupportedChainId.SEPOLIA,
    name: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
  [SupportedChainId.BSC]: {
    chainId: SupportedChainId.BSC,
    name: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    explorerUrl: 'https://bscscan.com',
    isTestnet: false,
  },
  [SupportedChainId.POLYGON]: {
    chainId: SupportedChainId.POLYGON,
    name: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    explorerUrl: 'https://polygonscan.com',
    isTestnet: false,
  },
  [SupportedChainId.ARBITRUM]: {
    chainId: SupportedChainId.ARBITRUM,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://arbiscan.io',
    isTestnet: false,
  },
  [SupportedChainId.OPTIMISM]: {
    chainId: SupportedChainId.OPTIMISM,
    name: 'Optimism',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://optimistic.etherscan.io',
    isTestnet: false,
  },
  [SupportedChainId.BASE]: {
    chainId: SupportedChainId.BASE,
    name: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
  },
  [SupportedChainId.AVALANCHE]: {
    chainId: SupportedChainId.AVALANCHE,
    name: 'Avalanche C-Chain',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    explorerUrl: 'https://snowtrace.io',
    isTestnet: false,
  },
  [SupportedChainId.GNOSIS]: {
    chainId: SupportedChainId.GNOSIS,
    name: 'Gnosis Chain',
    nativeCurrency: { name: 'xDAI', symbol: 'XDAI', decimals: 18 },
    explorerUrl: 'https://gnosisscan.io',
    isTestnet: false,
  },
};

/**
 * Get chain configuration by chain ID
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId as SupportedChainId];
}

/**
 * Check if a chain ID is supported
 */
export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return chainId in CHAIN_CONFIGS;
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.values(SupportedChainId).filter(
    (value) => typeof value === 'number'
  ) as SupportedChainId[];
}

/**
 * Get all mainnet chain IDs
 */
export function getMainnetChainIds(): SupportedChainId[] {
  return getSupportedChainIds().filter((chainId) => !CHAIN_CONFIGS[chainId].isTestnet);
}

/**
 * Get all testnet chain IDs
 */
export function getTestnetChainIds(): SupportedChainId[] {
  return getSupportedChainIds().filter((chainId) => CHAIN_CONFIGS[chainId].isTestnet);
}
