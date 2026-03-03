/**
 * Ethers v5 Adapter for IntentSwap SDK
 */

import { ethers } from 'ethers';
import type {
  Adapter,
  TypedDataDomain,
  TypedDataField,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Log,
} from '@okx-intent-swap/sdk-common';

/**
 * Options for creating an EthersV5Adapter
 */
export interface EthersV5AdapterOptions {
  /** The ethers provider */
  provider: ethers.providers.Provider;
  /** The signer (optional, required for signing operations) */
  signer?: ethers.Signer;
}

/**
 * Adapter implementation for ethers.js v5
 */
export class EthersV5Adapter implements Adapter {
  private provider: ethers.providers.Provider;
  private signer?: ethers.Signer;

  constructor(options: EthersV5AdapterOptions) {
    this.provider = options.provider;
    this.signer = options.signer;
  }

  /**
   * Get the signer, throwing if not available
   */
  private getSigner(): ethers.Signer {
    if (!this.signer) {
      throw new Error('Signer not available. Provide a signer in the adapter options.');
    }
    return this.signer;
  }

  /**
   * Sign typed data using EIP-712
   */
  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    const signer = this.getSigner();

    // ethers v5 uses _signTypedData
    // We need to cast to any because TypeScript doesn't know about _signTypedData
    const signerWithTypedData = signer as ethers.Signer & {
      _signTypedData: (
        domain: TypedDataDomain,
        types: Record<string, TypedDataField[]>,
        value: Record<string, unknown>
      ) => Promise<string>;
    };

    if (typeof signerWithTypedData._signTypedData !== 'function') {
      throw new Error('Signer does not support EIP-712 typed data signing');
    }

    return signerWithTypedData._signTypedData(domain, types, value);
  }

  /**
   * Sign a message using eth_sign
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    const signer = this.getSigner();
    return signer.signMessage(message);
  }

  /**
   * Sign a digest directly (no prefixing).
   */
  async signDigest(digest: string): Promise<string> {
    const signer = this.getSigner();

    // Wallet supports _signingKey().signDigest
    const anySigner = signer as any;
    if (typeof anySigner._signingKey === 'function') {
      const sig = anySigner._signingKey().signDigest(digest);
      return ethers.utils.joinSignature(sig);
    }

    throw new Error('Signer does not support signDigest (requires ethers.Wallet or similar)');
  }

  /**
   * Get the signer's address
   */
  async getAddress(): Promise<string> {
    const signer = this.getSigner();
    return signer.getAddress();
  }

  /**
   * Send a transaction
   */
  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const signer = this.getSigner();

    const ethersRequest: ethers.providers.TransactionRequest = {
      to: tx.to,
      from: tx.from,
      data: tx.data,
      value: tx.value !== undefined ? tx.value.toString() : undefined,
      gasLimit: tx.gasLimit !== undefined ? tx.gasLimit.toString() : undefined,
      gasPrice: tx.gasPrice !== undefined ? tx.gasPrice.toString() : undefined,
      maxFeePerGas: tx.maxFeePerGas !== undefined ? tx.maxFeePerGas.toString() : undefined,
      maxPriorityFeePerGas:
        tx.maxPriorityFeePerGas !== undefined ? tx.maxPriorityFeePerGas.toString() : undefined,
      nonce: tx.nonce,
      chainId: tx.chainId,
    };

    const response = await signer.sendTransaction(ethersRequest);

    return {
      hash: response.hash,
      wait: async (confirmations?: number): Promise<TransactionReceipt> => {
        const receipt = await response.wait(confirmations);
        return this.convertReceipt(receipt);
      },
    };
  }

  /**
   * Call a contract method (read-only)
   */
  async call(tx: TransactionRequest): Promise<string> {
    const ethersRequest: ethers.providers.TransactionRequest = {
      to: tx.to,
      from: tx.from,
      data: tx.data,
      value: tx.value !== undefined ? tx.value.toString() : undefined,
    };

    return this.provider.call(ethersRequest);
  }

  /**
   * Get the current chain ID
   */
  async getChainId(): Promise<number> {
    const network = await this.provider.getNetwork();
    return network.chainId;
  }

  /**
   * Get the current block number
   */
  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  /**
   * Get the balance of an address
   */
  async getBalance(address: string): Promise<bigint> {
    const balance = await this.provider.getBalance(address);
    return BigInt(balance.toString());
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    const ethersRequest: ethers.providers.TransactionRequest = {
      to: tx.to,
      from: tx.from,
      data: tx.data,
      value: tx.value !== undefined ? tx.value.toString() : undefined,
    };

    const estimate = await this.provider.estimateGas(ethersRequest);
    return BigInt(estimate.toString());
  }

  /**
   * Convert ethers receipt to our format
   */
  private convertReceipt(receipt: ethers.providers.TransactionReceipt): TransactionReceipt {
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status ?? 0,
      gasUsed: BigInt(receipt.gasUsed.toString()),
      logs: receipt.logs.map((log) => this.convertLog(log)),
    };
  }

  /**
   * Convert ethers log to our format
   */
  private convertLog(log: ethers.providers.Log): Log {
    return {
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
    };
  }

  /**
   * Get the underlying provider
   */
  getProvider(): ethers.providers.Provider {
    return this.provider;
  }

  /**
   * Get the underlying signer (if available)
   */
  getUnderlyingSigner(): ethers.Signer | undefined {
    return this.signer;
  }

  /**
   * Set a new signer
   */
  setSigner(signer: ethers.Signer): void {
    this.signer = signer;
  }

  /**
   * Set a new provider
   */
  setProvider(provider: ethers.providers.Provider): void {
    this.provider = provider;
  }
}
