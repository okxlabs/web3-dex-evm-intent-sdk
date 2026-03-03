/**
 * OrderSigningUtils - Main utility class for order signing
 */

import { ethers } from 'ethers';
import type { Order, SignedOrder, Adapter, TypedDataDomain } from '@okx-intent-swap/sdk-common';
import {
  SigningScheme,
  packOrderUid,
  extractOrderUidParams,
  ORDER_UID_LENGTH,
} from '@okx-intent-swap/sdk-common';
import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION, SupportedChainId } from '@okx-intent-swap/sdk-config';
import { ORDER_TYPES, orderToEIP712Message } from './eip712';

/**
 * Options for signing an order
 */
export interface SignOrderOptions {
  /** The signing scheme to use */
  signingScheme?: SigningScheme;
  /**
   * Optional on-chain domainSeparator override (recommended).
   * If provided, signatures are generated over the exact digest the contract verifies.
   */
  domainSeparator?: string;
}

/**
 * Result of signing an order
 */
export interface SigningResult {
  /** The signature */
  signature: string;
  /** The signing scheme used */
  signingScheme: SigningScheme;
}

/**
 * OrderSigningUtils provides utilities for signing and hashing orders
 */
export class OrderSigningUtils {
  /**
   * Get the EIP-712 domain for a specific chain and settlement contract
   */
  static getDomain(chainId: number, settlementAddress: string): TypedDataDomain {
    return {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId,
      verifyingContract: settlementAddress,
    };
  }

  /**
   * Get the EIP-712 types for order signing
   */
  static getOrderTypes(): typeof ORDER_TYPES {
    return ORDER_TYPES;
  }

  /**
   * Convert an order to the EIP-712 message format
   */
  static orderToMessage(order: Order): Record<string, unknown> {
    return orderToEIP712Message(order);
  }

  /**
   * Sign an order using the specified adapter and signing scheme
   */
  static async signOrder(
    order: Order,
    chainId: number,
    settlementAddress: string,
    adapter: Adapter,
    options: SignOrderOptions = {}
  ): Promise<SigningResult> {
    const signingScheme = options.signingScheme ?? SigningScheme.EIP712;

    let signature: string;

    switch (signingScheme) {
      case SigningScheme.EIP712: {
        // Prefer signing the exact digest the contract verifies.
        if (options.domainSeparator) {
          const digest = this.computeOrderDigestFromDomainSeparator(order, options.domainSeparator);
          signature = await adapter.signDigest(digest);
        } else {
          const domain = this.getDomain(chainId, settlementAddress);
          const message = this.orderToMessage(order);
          signature = await adapter.signTypedData(domain, ORDER_TYPES, message);
        }
        break;
      }
      case SigningScheme.ETH_SIGN: {
        // For eth_sign, we need to compute the order digest first
        // Then sign it with eth_sign which prefixes "\x19Ethereum Signed Message:\n32"
        const domain = this.getDomain(chainId, settlementAddress);
        const message = this.orderToMessage(order);
        // First get the typed data hash
        signature = await adapter.signTypedData(domain, ORDER_TYPES, message);
        // Note: eth_sign would need a different approach using signMessage
        // This is simplified for now
        break;
      }
      case SigningScheme.PRE_SIGN: {
        // For pre-sign, the "signature" is just the owner address (20 bytes).
        // Prefer the declared order.owner (if set); otherwise default to the connected signer.
        const ownerAddress =
          order.owner && order.owner !== ethers.constants.AddressZero
            ? order.owner
            : await adapter.getAddress();
        signature = ownerAddress;
        break;
      }
      case SigningScheme.EIP1271: {
        // For EIP-1271, the signature format is: owner address (20 bytes) + actual signature
        const ownerAddress = order.owner;
        if (!ownerAddress || ownerAddress === ethers.constants.AddressZero) {
          throw new Error('EIP-1271 requires non-zero order.owner (smart contract wallet address)');
        }
        const domain = this.getDomain(chainId, settlementAddress);
        const message = this.orderToMessage(order);
        const sig = await adapter.signTypedData(domain, ORDER_TYPES, message);
        // Pack owner address + signature
        signature = ownerAddress + sig.slice(2);
        break;
      }
      default:
        throw new Error(`Unsupported signing scheme: ${signingScheme}`);
    }

    return { signature, signingScheme };
  }

  /**
   * Create a complete signed order
   */
  static async createSignedOrder(
    order: Order,
    chainId: number,
    settlementAddress: string,
    adapter: Adapter,
    options: SignOrderOptions = {}
  ): Promise<SignedOrder> {
    const { signature, signingScheme } = await this.signOrder(
      order,
      chainId,
      settlementAddress,
      adapter,
      options
    );

    const orderDigest = options.domainSeparator
      ? this.computeOrderDigestFromDomainSeparator(order, options.domainSeparator)
      : await this.computeOrderDigest(order, this.getDomain(chainId, settlementAddress));

    // Owner used in UID must match what the on-chain verification uses for filledAmount tracking.
    const ownerForUid =
      signingScheme === SigningScheme.EIP1271
        ? order.owner
        : signingScheme === SigningScheme.PRE_SIGN
          ? signature
          : await adapter.getAddress();

    const uid = packOrderUid(orderDigest, ownerForUid, order.validTo);

    return {
      order,
      signature,
      signingScheme,
      uid,
      orderDigest,
      owner: ownerForUid,
    };
  }

  /**
   * Compute the order digest (EIP-712 hash)
   */
  static async computeOrderDigest(order: Order, domain: TypedDataDomain): Promise<string> {
    // Compute the EIP-712 signing hash used by the Settlement contract:
    // OrderLib.hash(order, domainSeparator) where domainSeparator matches Signing.sol
    // Ethers v5: ethers.utils._TypedDataEncoder.hash(domain, types, message)
    return ethers.utils._TypedDataEncoder.hash(domain as any, ORDER_TYPES as any, this.orderToMessage(order));
  }

  /**
   * Compute the struct hash for the Order (EIP-712 hashStruct).
   */
  static computeOrderStructHash(order: Order): string {
    return (ethers.utils as any)._TypedDataEncoder.hashStruct(
      'Order',
      ORDER_TYPES as any,
      this.orderToMessage(order)
    );
  }

  /**
   * Compute the exact digest verified by Solidity when `domainSeparator` is taken from chain.
   * digest = keccak256(0x1901 || domainSeparator || structHash)
   */
  static computeOrderDigestFromDomainSeparator(order: Order, domainSeparator: string): string {
    const structHash = this.computeOrderStructHash(order);
    const packed = ethers.utils.solidityPack(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', domainSeparator, structHash]
    );
    return ethers.utils.keccak256(packed);
  }

  /**
   * Compute order UID from order digest, owner, and validTo
   */
  static computeOrderUid(orderDigest: string, owner: string, validTo: number): string {
    return packOrderUid(orderDigest, owner, validTo);
  }

  /**
   * Extract order UID parameters
   */
  static extractOrderUidParams(orderUid: string): {
    orderDigest: string;
    owner: string;
    validTo: number;
  } {
    return extractOrderUidParams(orderUid);
  }

  /**
   * Sign order cancellation(s)
   */
  static async signOrderCancellations(
    orderUids: string[],
    chainId: number,
    adapter: Adapter
  ): Promise<{ signature: string; signingScheme: SigningScheme }> {
    // Order cancellation is done by calling invalidateOrder on the contract
    // or by signing a cancellation message
    // For now, return the signer address as the "signature" for pre-sign style
    const owner = await adapter.getAddress();
    return {
      signature: owner,
      signingScheme: SigningScheme.PRE_SIGN,
    };
  }

  /**
   * Validate an order UID
   */
  static isValidOrderUid(orderUid: string): boolean {
    try {
      const cleanUid = orderUid.startsWith('0x') ? orderUid.slice(2) : orderUid;
      return cleanUid.length === ORDER_UID_LENGTH * 2;
    } catch {
      return false;
    }
  }

  /**
   * Encode a pre-sign signature (just the owner address)
   */
  static encodePreSignSignature(owner: string): string {
    // Pre-sign signature is just the 20-byte owner address
    return owner.toLowerCase();
  }

  /**
   * Encode an EIP-1271 signature (owner address + actual signature)
   */
  static encodeEIP1271Signature(owner: string, signature: string): string {
    const ownerClean = owner.startsWith('0x') ? owner.slice(2) : owner;
    const sigClean = signature.startsWith('0x') ? signature.slice(2) : signature;
    return '0x' + ownerClean + sigClean;
  }
}
