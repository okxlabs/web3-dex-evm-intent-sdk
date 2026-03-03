/**
 * Order hashing utilities
 * Implements the same hashing logic as OrderLib.sol
 */

import type { CommissionInfo, Order } from '@okx-intent-swap/sdk-common';
import { COMMISSION_INFO_TYPE_HASH, hexToBytes, ORDER_KIND_HASH, ORDER_TYPE_HASH } from '@okx-intent-swap/sdk-common';
import { ethers } from 'ethers';

/**
 * keccak256 helper using ethers (peer dependency).
 */
export function keccak256(data: Uint8Array): string {
  return ethers.utils.keccak256(data);
}

/**
 * ABI encode parameters using ethers (peer dependency).
 */
export function abiEncode(types: string[], values: unknown[]): Uint8Array {
  const encodedHex = ethers.utils.defaultAbiCoder.encode(types, values as any[]);
  return ethers.utils.arrayify(encodedHex);
}

/**
 * Type hashes as computed in Solidity
 */
export const TYPE_HASHES = {
  // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
  DOMAIN: '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f',

  // keccak256(
  //   "Order(address fromTokenAddress,address toTokenAddress,address owner,address receiver,uint256 fromTokenAmount,uint256 toTokenAmount,uint32 validTo,bytes32 appData,bytes32 swapMode,bool partiallyFillable,CommissionInfo[] commissionInfos)" +
  //   "CommissionInfo(uint256 feePercent,address referrerWalletAddress,uint256 flag)"
  // )
  ORDER: ORDER_TYPE_HASH,

  // keccak256("CommissionInfo(uint256 feePercent,address referrerWalletAddress,uint256 flag)")
  COMMISSION_INFO: COMMISSION_INFO_TYPE_HASH,
} as const;

/**
 * Compute the EIP-712 domain separator
 */
export function computeDomainSeparator(
  name: string,
  version: string,
  chainId: number,
  verifyingContract: string,
  keccak256Fn: (data: Uint8Array) => string,
  abiEncodeFn: (types: string[], values: unknown[]) => Uint8Array
): string {
  const nameHash = keccak256Fn(ethers.utils.toUtf8Bytes(name));
  const versionHash = keccak256Fn(ethers.utils.toUtf8Bytes(version));

  const encoded = abiEncodeFn(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
    [TYPE_HASHES.DOMAIN, nameHash, versionHash, chainId, verifyingContract]
  );

  return keccak256Fn(encoded);
}

/**
 * Hash a commission info struct
 */
export function hashCommissionInfo(
  info: CommissionInfo,
  typeHash: string,
  keccak256Fn: (data: Uint8Array) => string,
  abiEncodeFn: (types: string[], values: unknown[]) => Uint8Array
): string {
  const encoded = abiEncodeFn(
    ['bytes32', 'uint256', 'address', 'uint256'],
    [typeHash, info.feePercent.toString(), info.referrerWalletAddress, info.flag.toString()]
  );

  return keccak256Fn(encoded);
}

/**
 * Hash an array of commission infos
 */
export function hashCommissionInfos(
  infos: CommissionInfo[],
  typeHash: string,
  keccak256Fn: (data: Uint8Array) => string,
  abiEncodeFn: (types: string[], values: unknown[]) => Uint8Array
): string {
  const hashes = infos.map((info) => hashCommissionInfo(info, typeHash, keccak256Fn, abiEncodeFn));

  // Concatenate all hashes and hash the result
  const concatenated = '0x' + hashes.map((h) => h.slice(2)).join('');
  return keccak256Fn(hexToBytes(concatenated));
}

/**
 * Compute the struct hash for an order
 */
export function hashOrderStruct(
  order: Order,
  orderTypeHash: string,
  commissionTypeHash: string,
  keccak256Fn: (data: Uint8Array) => string,
  abiEncodeFn: (types: string[], values: unknown[]) => Uint8Array
): string {
  const commissionInfosHash = hashCommissionInfos(
    order.commissionInfos,
    commissionTypeHash,
    keccak256Fn,
    abiEncodeFn
  );

  const encoded = abiEncodeFn(
    [
      'bytes32', // type hash
      'address', // fromTokenAddress
      'address', // toTokenAddress
      'address', // owner
      'address', // receiver
      'uint256', // fromTokenAmount
      'uint256', // toTokenAmount
      'uint32', // validTo
      'bytes32', // appData
      'bytes32', // swapMode
      'bool', // partiallyFillable
      'bytes32', // commissionInfosHash
    ],
    [
      orderTypeHash,
      order.fromTokenAddress,
      order.toTokenAddress,
      order.owner,
      order.receiver,
      order.fromTokenAmount.toString(),
      order.toTokenAmount.toString(),
      order.validTo,
      order.appData,
      ORDER_KIND_HASH[order.swapMode],
      order.partiallyFillable,
      commissionInfosHash,
    ]
  );

  return keccak256Fn(encoded);
}

/**
 * Compute the EIP-712 order digest
 */
export function computeOrderDigest(
  order: Order,
  domainSeparator: string,
  orderTypeHash: string,
  commissionTypeHash: string,
  keccak256Fn: (data: Uint8Array) => string,
  abiEncodeFn: (types: string[], values: unknown[]) => Uint8Array
): string {
  const structHash = hashOrderStruct(
    order,
    orderTypeHash,
    commissionTypeHash,
    keccak256Fn,
    abiEncodeFn
  );

  // EIP-712 signing hash: keccak256("\x19\x01" || domainSeparator || structHash)
  const prefix = new Uint8Array([0x19, 0x01]);
  const domainBytes = hexToBytes(domainSeparator);
  const structBytes = hexToBytes(structHash);

  const message = new Uint8Array(prefix.length + domainBytes.length + structBytes.length);
  message.set(prefix, 0);
  message.set(domainBytes, prefix.length);
  message.set(structBytes, prefix.length + domainBytes.length);

  return keccak256Fn(message);
}
