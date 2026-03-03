/**
 * Tests for OrderSigningUtils
 */

import type { Adapter, Order } from '@okx-intent-swap/sdk-common';
import { ORDER_UID_LENGTH, OrderKind, SigningScheme } from '@okx-intent-swap/sdk-common';
import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION, SupportedChainId } from '@okx-intent-swap/sdk-config';
import { OrderSigningUtils } from '../OrderSigningUtils';
import { ORDER_TYPES } from '../eip712';

// Mock adapter
const mockAdapter: Adapter = {
  signTypedData: jest.fn().mockResolvedValue('0x' + '1'.repeat(130)),
  signMessage: jest.fn().mockResolvedValue('0x' + '2'.repeat(130)),
  signDigest: jest.fn().mockResolvedValue('0x' + '2'.repeat(130)),
  getAddress: jest.fn().mockResolvedValue('0x' + '3'.repeat(40)),
  sendTransaction: jest.fn(),
  call: jest.fn(),
  getChainId: jest.fn().mockResolvedValue(11155111),
  getBlockNumber: jest.fn().mockResolvedValue(12345678),
  getBalance: jest.fn().mockResolvedValue(1000000000000000000n),
  estimateGas: jest.fn().mockResolvedValue(21000n),
};

describe('OrderSigningUtils', () => {
  const testOrder: Order = {
    fromTokenAddress: '0x' + '1'.repeat(40),
    toTokenAddress: '0x' + '2'.repeat(40),
    receiver: '0x' + '3'.repeat(40),
    fromTokenAmount: 1000000000000000000n, // 1 ETH
    toTokenAmount: 100000000n, // 100 USDC
    validTo: Math.floor(Date.now() / 1000) + 3600,
    appData: '0x' + '0'.repeat(64),
    swapMode: OrderKind.EXACT_IN,
    partiallyFillable: false,
    owner: '0x' + '3'.repeat(40),
    commissionInfos: [],
  };

  const settlementAddress = '0x' + '4'.repeat(40);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDomain', () => {
    it('should return correct domain', () => {
      const domain = OrderSigningUtils.getDomain(SupportedChainId.SEPOLIA, settlementAddress);

      expect(domain.name).toBe(EIP712_DOMAIN_NAME);
      expect(domain.version).toBe(EIP712_DOMAIN_VERSION);
      expect(domain.chainId).toBe(SupportedChainId.SEPOLIA);
      expect(domain.verifyingContract).toBe(settlementAddress);
    });
  });

  describe('getOrderTypes', () => {
    it('should return ORDER_TYPES', () => {
      const types = OrderSigningUtils.getOrderTypes();

      expect(types).toBe(ORDER_TYPES);
      expect(types.Order).toBeDefined();
      expect(types.CommissionInfo).toBeDefined();
    });
  });

  describe('orderToMessage', () => {
    it('should convert order to EIP-712 message format', () => {
      const message = OrderSigningUtils.orderToMessage(testOrder);

      expect(message.fromTokenAddress).toBe(testOrder.fromTokenAddress);
      expect(message.toTokenAddress).toBe(testOrder.toTokenAddress);
      expect(message.receiver).toBe(testOrder.receiver);
      expect(message.fromTokenAmount).toBe(testOrder.fromTokenAmount.toString());
      expect(message.toTokenAmount).toBe(testOrder.toTokenAmount.toString());
      expect(message.validTo).toBe(testOrder.validTo);
      expect(message.appData).toBe(testOrder.appData);
      expect(message.partiallyFillable).toBe(testOrder.partiallyFillable);
      expect(message.owner).toBe(testOrder.owner);
      expect(Array.isArray(message.commissionInfos)).toBe(true);
    });

    it('should convert swapMode to bytes32 hash', () => {
      const message = OrderSigningUtils.orderToMessage(testOrder);

      // SWAPMODE_EXACTIN hash
      expect(message.swapMode).toBe('0x39124995febcd74fadbdf9bbad44826dab79bc9478b4965fd0d2381c0d649b2c');
    });
  });

  describe('signOrder', () => {
    it('should sign order with EIP-712', async () => {
      const result = await OrderSigningUtils.signOrder(
        testOrder,
        SupportedChainId.SEPOLIA,
        settlementAddress,
        mockAdapter,
        { signingScheme: SigningScheme.EIP712 }
      );

      expect(result.signature).toBeDefined();
      expect(result.signingScheme).toBe(SigningScheme.EIP712);
      expect(mockAdapter.signTypedData).toHaveBeenCalled();
    });

    it('should sign order with PreSign scheme', async () => {
      const result = await OrderSigningUtils.signOrder(
        testOrder,
        SupportedChainId.SEPOLIA,
        settlementAddress,
        mockAdapter,
        { signingScheme: SigningScheme.PRE_SIGN }
      );

      // PreSign signature is just the owner address
      expect(result.signature).toBe('0x' + '3'.repeat(40));
      expect(result.signingScheme).toBe(SigningScheme.PRE_SIGN);
      expect(mockAdapter.getAddress).toHaveBeenCalled();
    });

    it('should default to EIP-712 signing', async () => {
      const result = await OrderSigningUtils.signOrder(
        testOrder,
        SupportedChainId.SEPOLIA,
        settlementAddress,
        mockAdapter
      );

      expect(result.signingScheme).toBe(SigningScheme.EIP712);
    });
  });

  describe('createSignedOrder', () => {
    it('should create a complete signed order', async () => {
      const signedOrder = await OrderSigningUtils.createSignedOrder(
        testOrder,
        SupportedChainId.SEPOLIA,
        settlementAddress,
        mockAdapter
      );

      expect(signedOrder.order).toBe(testOrder);
      expect(signedOrder.signature).toBeDefined();
      expect(signedOrder.signingScheme).toBe(SigningScheme.EIP712);
      expect(signedOrder.uid).toBeDefined();
      expect(signedOrder.owner).toBe('0x' + '3'.repeat(40));
    });
  });

  describe('computeOrderUid', () => {
    it('should compute correct order UID', () => {
      const orderDigest = '0x' + '1'.repeat(64);
      const owner = '0x' + '2'.repeat(40);
      const validTo = 1704067200;

      const uid = OrderSigningUtils.computeOrderUid(orderDigest, owner, validTo);

      expect(uid).toHaveLength(2 + ORDER_UID_LENGTH * 2);
    });
  });

  describe('extractOrderUidParams', () => {
    it('should extract params from UID', () => {
      const orderDigest = '0x' + '1'.repeat(64);
      const owner = '0x' + '2'.repeat(40);
      const validTo = 1704067200;

      const uid = OrderSigningUtils.computeOrderUid(orderDigest, owner, validTo);
      const params = OrderSigningUtils.extractOrderUidParams(uid);

      expect(params.orderDigest.toLowerCase()).toBe(orderDigest.toLowerCase());
      expect(params.owner.toLowerCase()).toBe(owner.toLowerCase());
      expect(params.validTo).toBe(validTo);
    });
  });

  describe('isValidOrderUid', () => {
    it('should return true for valid UID', () => {
      const uid = '0x' + '1'.repeat(ORDER_UID_LENGTH * 2);
      expect(OrderSigningUtils.isValidOrderUid(uid)).toBe(true);
    });

    it('should return false for invalid UID', () => {
      expect(OrderSigningUtils.isValidOrderUid('0x123')).toBe(false);
      expect(OrderSigningUtils.isValidOrderUid('invalid')).toBe(false);
    });
  });

  describe('encodePreSignSignature', () => {
    it('should return lowercase owner address', () => {
      const owner = '0xAbCdEf' + '1'.repeat(34);
      const signature = OrderSigningUtils.encodePreSignSignature(owner);

      expect(signature).toBe(owner.toLowerCase());
    });
  });

  describe('encodeEIP1271Signature', () => {
    it('should pack owner and signature', () => {
      const owner = '0x' + '1'.repeat(40);
      const signature = '0x' + '2'.repeat(130);

      const encoded = OrderSigningUtils.encodeEIP1271Signature(owner, signature);

      expect(encoded.startsWith('0x')).toBe(true);
      expect(encoded).toContain('1'.repeat(40));
      expect(encoded).toContain('2'.repeat(130));
    });
  });
});
