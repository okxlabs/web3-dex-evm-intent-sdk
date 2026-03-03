/**
 * Tests for common utility functions
 */

import {
  packOrderUid,
  extractOrderUidParams,
  hexToBytes,
  bytesToHex,
  isValidAddress,
  isValidBytes32,
  encodeTradeFlags,
  decodeTradeFlags,
  getActualReceiver,
  validateOrder,
  isOrderExpired,
  getCurrentTimestamp,
} from '../utils';
import { OrderKind, SigningScheme } from '../types';
import { RECEIVER_SAME_AS_OWNER, ORDER_UID_LENGTH, ZERO_BYTES32 } from '../constants';

describe('packOrderUid', () => {
  it('should pack order UID correctly', () => {
    const orderDigest = '0x' + '1'.repeat(64);
    const owner = '0x' + '2'.repeat(40);
    const validTo = 1704067200; // 2024-01-01 00:00:00 UTC

    const uid = packOrderUid(orderDigest, owner, validTo);

    expect(uid).toHaveLength(2 + ORDER_UID_LENGTH * 2); // 0x prefix + 56 bytes
    expect(uid.startsWith('0x')).toBe(true);
  });

  it('should throw for invalid order digest', () => {
    const orderDigest = '0x' + '1'.repeat(62); // Too short
    const owner = '0x' + '2'.repeat(40);
    const validTo = 1704067200;

    expect(() => packOrderUid(orderDigest, owner, validTo)).toThrow('Order digest must be 32 bytes');
  });

  it('should throw for invalid owner address', () => {
    const orderDigest = '0x' + '1'.repeat(64);
    const owner = '0x' + '2'.repeat(38); // Too short
    const validTo = 1704067200;

    expect(() => packOrderUid(orderDigest, owner, validTo)).toThrow('Owner address must be 20 bytes');
  });
});

describe('extractOrderUidParams', () => {
  it('should extract order UID params correctly', () => {
    const orderDigest = '0x' + '1'.repeat(64);
    const owner = '0x' + '2'.repeat(40);
    const validTo = 1704067200;

    const uid = packOrderUid(orderDigest, owner, validTo);
    const params = extractOrderUidParams(uid);

    expect(params.orderDigest.toLowerCase()).toBe(orderDigest.toLowerCase());
    expect(params.owner.toLowerCase()).toBe(owner.toLowerCase());
    expect(params.validTo).toBe(validTo);
  });

  it('should throw for invalid UID length', () => {
    const invalidUid = '0x' + '1'.repeat(100); // Wrong length

    expect(() => extractOrderUidParams(invalidUid)).toThrow(`Order UID must be ${ORDER_UID_LENGTH} bytes`);
  });
});

describe('hexToBytes', () => {
  it('should convert hex to bytes', () => {
    const hex = '0x1234';
    const bytes = hexToBytes(hex);

    expect(bytes).toEqual(new Uint8Array([0x12, 0x34]));
  });

  it('should handle hex without 0x prefix', () => {
    const hex = '1234';
    const bytes = hexToBytes(hex);

    expect(bytes).toEqual(new Uint8Array([0x12, 0x34]));
  });
});

describe('bytesToHex', () => {
  it('should convert bytes to hex', () => {
    const bytes = new Uint8Array([0x12, 0x34]);
    const hex = bytesToHex(bytes);

    expect(hex).toBe('0x1234');
  });
});

describe('isValidAddress', () => {
  it('should return true for valid address', () => {
    expect(isValidAddress('0x' + '1'.repeat(40))).toBe(true);
    expect(isValidAddress('0xAbCdEf' + '1'.repeat(34))).toBe(true);
  });

  it('should return false for invalid address', () => {
    expect(isValidAddress('0x' + '1'.repeat(39))).toBe(false); // Too short
    expect(isValidAddress('0x' + '1'.repeat(41))).toBe(false); // Too long
    expect(isValidAddress('1'.repeat(40))).toBe(false); // No 0x prefix
    expect(isValidAddress('0x' + 'g'.repeat(40))).toBe(false); // Invalid chars
  });
});

describe('isValidBytes32', () => {
  it('should return true for valid bytes32', () => {
    expect(isValidBytes32('0x' + '1'.repeat(64))).toBe(true);
    expect(isValidBytes32('0x' + 'abcdef'.repeat(10) + '1234')).toBe(true);
  });

  it('should return false for invalid bytes32', () => {
    expect(isValidBytes32('0x' + '1'.repeat(63))).toBe(false); // Too short
    expect(isValidBytes32('0x' + '1'.repeat(65))).toBe(false); // Too long
    expect(isValidBytes32('1'.repeat(64))).toBe(false); // No 0x prefix
  });
});

describe('encodeTradeFlags / decodeTradeFlags', () => {
  it('should encode and decode EXACT_IN fill-or-kill EIP712', () => {
    const flags = encodeTradeFlags(OrderKind.EXACT_IN, false, SigningScheme.EIP712);
    const decoded = decodeTradeFlags(flags);

    expect(decoded.swapMode).toBe(OrderKind.EXACT_IN);
    expect(decoded.partiallyFillable).toBe(false);
    expect(decoded.signingScheme).toBe(SigningScheme.EIP712);
  });

  it('should encode and decode EXACT_IN partial EthSign', () => {
    const flags = encodeTradeFlags(OrderKind.EXACT_IN, true, SigningScheme.ETH_SIGN);
    const decoded = decodeTradeFlags(flags);

    expect(decoded.swapMode).toBe(OrderKind.EXACT_IN);
    expect(decoded.partiallyFillable).toBe(true);
    expect(decoded.signingScheme).toBe(SigningScheme.ETH_SIGN);
  });

  it('should encode and decode PreSign scheme', () => {
    const flags = encodeTradeFlags(OrderKind.EXACT_IN, false, SigningScheme.PRE_SIGN);
    const decoded = decodeTradeFlags(flags);

    expect(decoded.signingScheme).toBe(SigningScheme.PRE_SIGN);
  });
});

describe('getActualReceiver', () => {
  it('should return owner when receiver is zero address', () => {
    const order = {
      receiver: RECEIVER_SAME_AS_OWNER,
    } as any;
    const owner = '0x' + '1'.repeat(40);

    expect(getActualReceiver(order, owner)).toBe(owner);
  });

  it('should return receiver when not zero address', () => {
    const receiver = '0x' + '2'.repeat(40);
    const order = {
      receiver,
    } as any;
    const owner = '0x' + '1'.repeat(40);

    expect(getActualReceiver(order, owner)).toBe(receiver);
  });
});

describe('validateOrder', () => {
  const validOrder = {
    fromTokenAddress: '0x' + '1'.repeat(40),
    toTokenAddress: '0x' + '2'.repeat(40),
    receiver: RECEIVER_SAME_AS_OWNER,
    fromTokenAmount: 1000n,
    toTokenAmount: 500n,
    validTo: getCurrentTimestamp() + 3600,
    appData: ZERO_BYTES32,
    swapMode: OrderKind.EXACT_IN,
    partiallyFillable: false,
    owner: '0x' + '3'.repeat(40),
    commissionInfos: [],
  };

  it('should not throw for valid order', () => {
    expect(() => validateOrder(validOrder)).not.toThrow();
  });

  it('should throw for invalid fromTokenAddress', () => {
    const order = { ...validOrder, fromTokenAddress: 'invalid' };
    expect(() => validateOrder(order)).toThrow('Invalid fromTokenAddress');
  });

  it('should throw for invalid toTokenAddress', () => {
    const order = { ...validOrder, toTokenAddress: 'invalid' };
    expect(() => validateOrder(order)).toThrow('Invalid toTokenAddress');
  });

  it('should throw for zero fromTokenAmount', () => {
    const order = { ...validOrder, fromTokenAmount: 0n };
    expect(() => validateOrder(order)).toThrow('fromTokenAmount must be positive');
  });

  it('should throw for expired order', () => {
    const order = { ...validOrder, validTo: getCurrentTimestamp() - 100 };
    expect(() => validateOrder(order)).toThrow('Order has expired');
  });
});

describe('isOrderExpired', () => {
  it('should return true for expired order', () => {
    const order = {
      validTo: getCurrentTimestamp() - 100,
    } as any;

    expect(isOrderExpired(order)).toBe(true);
  });

  it('should return false for valid order', () => {
    const order = {
      validTo: getCurrentTimestamp() + 3600,
    } as any;

    expect(isOrderExpired(order)).toBe(false);
  });
});

describe('getCurrentTimestamp', () => {
  it('should return current timestamp in seconds', () => {
    const before = Math.floor(Date.now() / 1000);
    const timestamp = getCurrentTimestamp();
    const after = Math.floor(Date.now() / 1000);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
