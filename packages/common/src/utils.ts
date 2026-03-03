/**
 * Utility functions for IntentSwap SDK
 */

import { ORDER_UID_LENGTH, RECEIVER_SAME_AS_OWNER } from './constants';
import type { CommissionInfo, CommissionInfoForSigning, Order, OrderForSigning } from './types';
import { ORDER_KIND_HASH, OrderKind } from './types';

/**
 * Converts a hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Packs order UID parameters into a 56-byte hex string
 * Structure: orderDigest (32 bytes) + owner (20 bytes) + validTo (4 bytes)
 */
export function packOrderUid(orderDigest: string, owner: string, validTo: number): string {
  // Remove 0x prefix and validate lengths
  const digestHex = orderDigest.startsWith('0x') ? orderDigest.slice(2) : orderDigest;
  const ownerHex = owner.startsWith('0x') ? owner.slice(2) : owner;

  if (digestHex.length !== 64) {
    throw new Error('Order digest must be 32 bytes');
  }
  if (ownerHex.length !== 40) {
    throw new Error('Owner address must be 20 bytes');
  }

  // Convert validTo to 4 bytes (big endian)
  const validToHex = validTo.toString(16).padStart(8, '0');

  // Pack: orderDigest (32) + owner (20) + validTo (4) = 56 bytes
  return '0x' + digestHex + ownerHex + validToHex;
}

/**
 * Extracts order UID parameters from a 56-byte hex string
 */
export function extractOrderUidParams(orderUid: string): {
  orderDigest: string;
  owner: string;
  validTo: number;
} {
  const cleanUid = orderUid.startsWith('0x') ? orderUid.slice(2) : orderUid;

  if (cleanUid.length !== ORDER_UID_LENGTH * 2) {
    throw new Error(`Order UID must be ${ORDER_UID_LENGTH} bytes`);
  }

  const orderDigest = '0x' + cleanUid.slice(0, 64);
  const owner = '0x' + cleanUid.slice(64, 104);
  const validTo = parseInt(cleanUid.slice(104, 112), 16);

  return { orderDigest, owner, validTo };
}

/**
 * Gets the actual receiver address for an order
 * Returns owner if receiver is address(0)
 */
export function getActualReceiver(order: Order, owner: string): string {
  if (
    order.receiver === RECEIVER_SAME_AS_OWNER ||
    order.receiver === '0x0000000000000000000000000000000000000000'
  ) {
    return owner;
  }
  return order.receiver;
}

/**
 * Converts an Order to the format required for EIP-712 signing
 */
export function orderToSigningFormat(order: Order): OrderForSigning {
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
    commissionInfos: order.commissionInfos.map(commissionInfoToSigningFormat),
  };
}

/**
 * Converts CommissionInfo to signing format
 */
export function commissionInfoToSigningFormat(info: CommissionInfo): CommissionInfoForSigning {
  return {
    feePercent: info.feePercent.toString(),
    referrerWalletAddress: info.referrerWalletAddress,
    flag: info.flag.toString(),
  };
}

/**
 * Validates an Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates a bytes32 value
 */
export function isValidBytes32(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Encodes trade flags from order properties
 * Flags structure:
 * - bit 0: reserved (always 0 for exactIn)
 * - bit 1: partially fillable (0 = fill-or-kill, 1 = partial)
 * - bits 5-6: signing scheme
 */
export function encodeTradeFlags(
  _swapMode: OrderKind,
  partiallyFillable: boolean,
  signingScheme: number
): bigint {
  let flags = 0n;

  // Bit 0: reserved (exactIn = 0)

  // Bit 1: partially fillable
  if (partiallyFillable) {
    flags |= 2n;
  }

  // Bits 5-6: signing scheme
  flags |= BigInt(signingScheme) << 5n;

  return flags;
}

/**
 * Decodes trade flags to order properties
 */
export function decodeTradeFlags(flags: bigint): {
  swapMode: OrderKind;
  partiallyFillable: boolean;
  signingScheme: number;
} {
  // SwapMode is always EXACT_IN
  const swapMode = OrderKind.EXACT_IN;

  const partiallyFillable = (flags & 2n) !== 0n;

  const signingScheme = Number((flags >> 5n) & 3n);

  return { swapMode, partiallyFillable, signingScheme };
}

/**
 * Validates commission info
 */
export function validateCommissionInfo(info: CommissionInfo): void {
  if (!isValidAddress(info.referrerWalletAddress)) {
    throw new Error('Invalid commission receiver address');
  }
  if (info.feePercent < 0n) {
    throw new Error('Fee cannot be negative');
  }
}

/**
 * Validates an order
 */
export function validateOrder(order: Order): void {
  if (!isValidAddress(order.fromTokenAddress)) {
    throw new Error('Invalid fromTokenAddress');
  }
  if (!isValidAddress(order.toTokenAddress)) {
    throw new Error('Invalid toTokenAddress');
  }
  if (order.receiver !== RECEIVER_SAME_AS_OWNER && !isValidAddress(order.receiver)) {
    throw new Error('Invalid receiver address');
  }
  if (!isValidAddress(order.owner)) {
    throw new Error('Invalid owner address');
  }
  if (!isValidBytes32(order.appData)) {
    throw new Error('Invalid appData');
  }
  if (order.fromTokenAmount <= 0n) {
    throw new Error('fromTokenAmount must be positive');
  }
  if (order.toTokenAmount <= 0n) {
    throw new Error('toTokenAmount must be positive');
  }
  if (order.validTo <= Math.floor(Date.now() / 1000)) {
    throw new Error('Order has expired');
  }
  for (const info of order.commissionInfos) {
    validateCommissionInfo(info);
  }
}

/**
 * Normalizes an address to lowercase format
 */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Checks if an order has expired
 */
export function isOrderExpired(order: Order): boolean {
  return order.validTo <= Math.floor(Date.now() / 1000);
}

/**
 * Gets the current timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
