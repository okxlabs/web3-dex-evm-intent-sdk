/**
 * TradingSdk - High-level SDK for trading on IntentSwap
 */

import { ethers } from 'ethers';
import type {
  Order,
  OrderParameters,
  SignedOrder,
  Adapter,
  TransactionReceipt,
} from '@okx-intent-swap/sdk-common';
import {
  OrderKind,
  SigningScheme,
  ZERO_BYTES32,
  RECEIVER_SAME_AS_OWNER,
  DEFAULT_ORDER_VALIDITY,
  getCurrentTimestamp,
  validateOrder,
} from '@okx-intent-swap/sdk-common';
import {
  SupportedChainId,
  getSettlementAddress,
  getTokenApproveProxyAddress,
  isSupportedChain,
} from '@okx-intent-swap/sdk-config';
import { SETTLEMENT_ABI } from '@okx-intent-swap/sdk-contracts';
import { OrderSigningUtils } from '@okx-intent-swap/sdk-order-signing';

/**
 * Options for creating a TradingSdk instance
 */
export interface TradingSdkOptions {
  /** Chain ID */
  chainId: SupportedChainId;
  /** Application code/identifier for tracking */
  appCode?: string;
  /** Custom settlement contract address (optional) */
  settlementAddress?: string;
  /** Custom token approve proxy address (optional) */
  tokenApproveProxyAddress?: string;
}

/**
 * Trader parameters that can be updated
 */
export interface TraderParams {
  /** Chain ID */
  chainId?: SupportedChainId;
}

/**
 * High-level SDK for trading on IntentSwap
 */
export class TradingSdk {
  private options: TradingSdkOptions;
  private adapter: Adapter;
  private settlementInterface: ethers.utils.Interface;

  constructor(options: TradingSdkOptions, adapter: Adapter) {
    if (!isSupportedChain(options.chainId)) {
      throw new Error(`Unsupported chain ID: ${options.chainId}`);
    }

    this.options = options;
    this.adapter = adapter;
    this.settlementInterface = new ethers.utils.Interface(SETTLEMENT_ABI as any);
  }

  /**
   * Get the settlement contract address
   */
  getSettlementAddress(): string {
    if (this.options.settlementAddress) {
      return this.options.settlementAddress;
    }
    const address = getSettlementAddress(this.options.chainId);
    if (!address) {
      throw new Error(`No settlement address for chain ${this.options.chainId}`);
    }
    return address;
  }

  /**
   * Get the token approve proxy address
   */
  getTokenApproveProxyAddress(): string {
    if (this.options.tokenApproveProxyAddress) {
      return this.options.tokenApproveProxyAddress;
    }
    const address = getTokenApproveProxyAddress(this.options.chainId);
    if (!address) {
      throw new Error(`No token approve proxy address for chain ${this.options.chainId}`);
    }
    return address;
  }

  /**
   * Update trader parameters (e.g., after network change)
   */
  setTraderParams(params: TraderParams): void {
    if (params.chainId !== undefined) {
      if (!isSupportedChain(params.chainId)) {
        throw new Error(`Unsupported chain ID: ${params.chainId}`);
      }
      this.options.chainId = params.chainId;
    }
  }

  /**
   * Create an order from parameters
   */
  async buildOrder(params: OrderParameters): Promise<Order> {
    const owner = await this.adapter.getAddress();

    const order: Order = {
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      receiver: params.receiver ?? RECEIVER_SAME_AS_OWNER,
      fromTokenAmount: params.fromTokenAmount,
      toTokenAmount: params.toTokenAmount,
      validTo: params.validTo ?? getCurrentTimestamp() + DEFAULT_ORDER_VALIDITY,
      appData: params.appData ?? ZERO_BYTES32,
      swapMode: params.swapMode ?? OrderKind.EXACT_IN,
      partiallyFillable: params.partiallyFillable ?? false,
      owner: params.owner ?? owner,
      commissionInfos: params.commissionInfos ?? [],
    };

    // Validate the order
    validateOrder(order);

    return order;
  }

  /**
   * Create and sign an order
   */
  async createOrder(params: OrderParameters): Promise<SignedOrder> {
    const order = await this.buildOrder(params);

    const domainSeparator = await this.getDomainSeparator();
    const signedOrder = await OrderSigningUtils.createSignedOrder(order, this.options.chainId, this.getSettlementAddress(), this.adapter, {
      signingScheme: SigningScheme.EIP712,
      domainSeparator,
    });

    return signedOrder;
  }

  /**
   * Sign an existing order
   */
  async signOrder(
    order: Order,
    signingScheme: SigningScheme = SigningScheme.EIP712
  ): Promise<SignedOrder> {
    const domainSeparator = signingScheme === SigningScheme.EIP712 ? await this.getDomainSeparator() : undefined;
    return OrderSigningUtils.createSignedOrder(order, this.options.chainId, this.getSettlementAddress(), this.adapter, {
      signingScheme,
      domainSeparator,
    });
  }

  /**
   * Set a pre-signature for an order (on-chain)
   */
  async setPreSignature(orderUid: string, signed: boolean): Promise<TransactionReceipt> {
    const settlementAddress = this.getSettlementAddress();

    const data = this.settlementInterface.encodeFunctionData('setPreSignature', [orderUid, signed]);

    const response = await this.adapter.sendTransaction({
      to: settlementAddress,
      data,
    });

    return response.wait();
  }

  /**
   * Invalidate an order (on-chain)
   */
  async invalidateOrder(orderUid: string): Promise<TransactionReceipt> {
    const settlementAddress = this.getSettlementAddress();

    const data = this.settlementInterface.encodeFunctionData('invalidateOrder', [orderUid]);

    const response = await this.adapter.sendTransaction({
      to: settlementAddress,
      data,
    });

    return response.wait();
  }

  /**
   * Get the filled amount for an order
   */
  async getFilledAmount(orderUid: string): Promise<bigint> {
    const settlementAddress = this.getSettlementAddress();

    const data = this.settlementInterface.encodeFunctionData('filledAmount', [orderUid]);

    const result = await this.adapter.call({
      to: settlementAddress,
      data,
    });

    const [filled] = this.settlementInterface.decodeFunctionResult('filledAmount', result);
    return BigInt(filled.toString());
  }

  /**
   * Check if an order is pre-signed
   */
  async isPreSigned(orderUid: string): Promise<boolean> {
    const settlementAddress = this.getSettlementAddress();

    const data = this.settlementInterface.encodeFunctionData('preSignature', [orderUid]);

    const result = await this.adapter.call({
      to: settlementAddress,
      data,
    });

    const [valueBn] = this.settlementInterface.decodeFunctionResult('preSignature', result);
    const value = BigInt(valueBn.toString());
    // PRE_SIGNED = keccak256("Signing.Scheme.PreSign")
    return value !== 0n;
  }

  /**
   * Get the domain separator from the contract
   */
  async getDomainSeparator(): Promise<string> {
    const settlementAddress = this.getSettlementAddress();

    const data = this.settlementInterface.encodeFunctionData('domainSeparator', []);

    const result = await this.adapter.call({
      to: settlementAddress,
      data,
    });
    const [sep] = this.settlementInterface.decodeFunctionResult('domainSeparator', result);
    return sep;
  }

  /**
   * Get the current chain ID
   */
  getChainId(): SupportedChainId {
    return this.options.chainId;
  }

  /**
   * Get the app code
   */
  getAppCode(): string | undefined {
    return this.options.appCode;
  }

  // Note: transaction encoding is handled via `ethers.Interface` now.
}
