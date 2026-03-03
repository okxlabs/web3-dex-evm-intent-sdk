/**
 * Adapter interface for Web3 library abstraction
 * Allows the SDK to work with different providers (ethers v5, ethers v6, viem)
 */

/**
 * EIP-712 typed data domain
 */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

/**
 * EIP-712 typed data field
 */
export interface TypedDataField {
  name: string;
  type: string;
}

/**
 * Transaction request
 */
export interface TransactionRequest {
  to?: string;
  from?: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId?: number;
}

/**
 * Transaction response
 */
export interface TransactionResponse {
  hash: string;
  wait(confirmations?: number): Promise<TransactionReceipt>;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: number;
  gasUsed: bigint;
  logs: Log[];
}

/**
 * Log entry
 */
export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

/**
 * Adapter interface that abstracts Web3 library operations
 */
export interface Adapter {
  /**
   * Sign typed data using EIP-712
   */
  signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string>;

  /**
   * Sign a message using eth_sign
   */
  signMessage(message: string | Uint8Array): Promise<string>;

  /**
   * Sign a 32-byte digest directly (ECDSA over the digest).
   *
   * This matches Solidity's `ecrecover(digest, v, r, s)` verification when the
   * contract expects the digest already includes EIP-712 domain separation.
   */
  signDigest(digest: string): Promise<string>;

  /**
   * Get the signer's address
   */
  getAddress(): Promise<string>;

  /**
   * Send a transaction
   */
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;

  /**
   * Call a contract method (read-only)
   */
  call(tx: TransactionRequest): Promise<string>;

  /**
   * Get the current chain ID
   */
  getChainId(): Promise<number>;

  /**
   * Get the current block number
   */
  getBlockNumber(): Promise<number>;

  /**
   * Get the balance of an address
   */
  getBalance(address: string): Promise<bigint>;

  /**
   * Estimate gas for a transaction
   */
  estimateGas(tx: TransactionRequest): Promise<bigint>;
}

/**
 * Global adapter instance
 */
let globalAdapter: Adapter | null = null;

/**
 * Set the global adapter
 */
export function setGlobalAdapter(adapter: Adapter): void {
  globalAdapter = adapter;
}

/**
 * Get the global adapter
 */
export function getGlobalAdapter(): Adapter | null {
  return globalAdapter;
}

/**
 * Clear the global adapter
 */
export function clearGlobalAdapter(): void {
  globalAdapter = null;
}
