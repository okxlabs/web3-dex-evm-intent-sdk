/**
 * Unit tests for @okx-intent-swap/sdk-solver
 *
 * Tests the full conversion pipeline: API JSON → on-chain calldata.
 */

import { ethers } from 'ethers';
import { SETTLEMENT_ABI } from '@okx-intent-swap/sdk-contracts';
import { CommissionFlags, COMMISSION_DENOM, OrderKind, encodeTradeFlags } from '@okx-intent-swap/sdk-common';
import type { SolveRequest, SolveResponse } from '../types';
import {
  packCommissionFlag,
  convertApiCommissionInfo,
  convertApiSolverFeeInfo,
  convertApiSurplusFeeInfo,
  convertClearingPrices,
  collectTokenAddresses,
  buildTokenIndexMap,
  buildTradeFromSolveOrders,
  computeCustomPrices,
  buildClearingPricesFromCustomPrices,
} from '../converters';
import type { OrderCustomPrice } from '../converters';
import { buildSettleCalldata } from '../calldata-builder';
import { LABEL_OKX, LABEL_PARENT, LABEL_CHILD, SolverFeeFlags, ADDRESS_ZERO } from '../constants';

// ============ Test Data ============

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SOLVER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const RECEIVER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const TRIM_RECEIVER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const REFERRER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

const SAMPLE_APP_DATA = '0x0000000000000000000000000000000000000000000000000000000000000001';
const SAMPLE_SIGNATURE =
  '0x' + 'ab'.repeat(65);

// ============ packCommissionFlag Tests ============

describe('packCommissionFlag', () => {
  it('should set FROM_TOKEN_COMMISSION when feeDirection is true', () => {
    const flag = packCommissionFlag(true, false, '');
    expect(flag & CommissionFlags.FROM_TOKEN_COMMISSION).toBe(CommissionFlags.FROM_TOKEN_COMMISSION);
    expect(flag & CommissionFlags.TO_TOKEN_COMMISSION).toBe(0n);
  });

  it('should set TO_TOKEN_COMMISSION when feeDirection is false', () => {
    const flag = packCommissionFlag(false, false, '');
    expect(flag & CommissionFlags.TO_TOKEN_COMMISSION).toBe(CommissionFlags.TO_TOKEN_COMMISSION);
    expect(flag & CommissionFlags.FROM_TOKEN_COMMISSION).toBe(0n);
  });

  it('should set IS_TO_B when toB is true', () => {
    const flag = packCommissionFlag(true, true, '');
    expect(flag & CommissionFlags.IS_TO_B).toBe(CommissionFlags.IS_TO_B);
  });

  it('should set LABEL_OKX for commissionType "okx"', () => {
    const flag = packCommissionFlag(true, false, 'okx');
    expect(flag & LABEL_OKX).toBe(LABEL_OKX);
  });

  it('should set LABEL_PARENT for commissionType "parent"', () => {
    const flag = packCommissionFlag(false, true, 'parent');
    expect(flag & LABEL_PARENT).toBe(LABEL_PARENT);
  });

  it('should set LABEL_CHILD for commissionType "child"', () => {
    const flag = packCommissionFlag(true, false, 'child');
    expect(flag & LABEL_CHILD).toBe(LABEL_CHILD);
  });

  it('should combine all bits correctly', () => {
    // fromToken + toB + okx
    const flag = packCommissionFlag(true, true, 'okx');
    expect(flag & CommissionFlags.FROM_TOKEN_COMMISSION).toBe(CommissionFlags.FROM_TOKEN_COMMISSION);
    expect(flag & CommissionFlags.IS_TO_B).toBe(CommissionFlags.IS_TO_B);
    expect(flag & LABEL_OKX).toBe(LABEL_OKX);
    // Should NOT have TO_TOKEN bit
    expect(flag & CommissionFlags.TO_TOKEN_COMMISSION).toBe(0n);
  });

  it('should handle unknown commissionType gracefully', () => {
    const flag = packCommissionFlag(true, false, 'unknown');
    // Only direction bit should be set
    expect(flag).toBe(CommissionFlags.FROM_TOKEN_COMMISSION);
  });
});

// ============ convertApiCommissionInfo Tests ============

describe('convertApiCommissionInfo', () => {
  it('should convert API commission info to on-chain format', () => {
    const result = convertApiCommissionInfo({
      feePercent: '10000000',
      referrerWalletAddress: REFERRER,
      feeDirection: true,
      toB: false,
      commissionType: 'okx',
    });

    expect(result.feePercent).toBe(10000000n);
    expect(result.referrerWalletAddress).toBe(REFERRER);
    expect(result.flag & CommissionFlags.FROM_TOKEN_COMMISSION).toBe(
      CommissionFlags.FROM_TOKEN_COMMISSION
    );
    expect(result.flag & LABEL_OKX).toBe(LABEL_OKX);
  });
});

// ============ convertApiSolverFeeInfo Tests ============

describe('convertApiSolverFeeInfo', () => {
  it('should convert fromToken solver fee', () => {
    const result = convertApiSolverFeeInfo({
      feePercent: '5000000',
      solverAddress: SOLVER,
      feeDirection: true,
      feeAmount: '1000',
    });

    expect(result.feePercent).toBe(5000000n);
    expect(result.solverAddr).toBe(SOLVER);
    expect(result.flag & SolverFeeFlags.FROM_TOKEN).toBe(SolverFeeFlags.FROM_TOKEN);
    expect(result.flag & SolverFeeFlags.TO_TOKEN).toBe(0n);
  });

  it('should convert toToken solver fee', () => {
    const result = convertApiSolverFeeInfo({
      feePercent: '3000000',
      solverAddress: SOLVER,
      feeDirection: false,
      feeAmount: '500',
    });

    expect(result.flag & SolverFeeFlags.TO_TOKEN).toBe(SolverFeeFlags.TO_TOKEN);
    expect(result.flag & SolverFeeFlags.FROM_TOKEN).toBe(0n);
  });
});

// ============ convertApiSurplusFeeInfo Tests ============

describe('convertApiSurplusFeeInfo', () => {
  it('should convert surplus fee info', () => {
    const result = convertApiSurplusFeeInfo({
      feePercent: '9800000',
      trimReceiver: TRIM_RECEIVER,
      flag: '0',
    });

    expect(result.feePercent).toBe(9800000n);
    expect(result.trimReceiver).toBe(TRIM_RECEIVER);
    expect(result.flag).toBe(0n);
  });
});

// ============ convertClearingPrices Tests ============

describe('convertClearingPrices', () => {
  it('should convert integer prices (no decimals)', () => {
    const prices = convertClearingPrices(
      { [USDC]: '1', [WETH]: '2000' },
      [USDC, WETH]
    );

    expect(prices).toEqual([1n, 2000n]);
  });

  it('should scale decimal prices to common precision', () => {
    const prices = convertClearingPrices(
      { [USDC]: '1', [WETH]: '0.0005' },
      [USDC, WETH]
    );

    // maxDecimals = 4, so scale by 10^4
    expect(prices).toEqual([10000n, 5n]);
  });

  it('should handle varying decimal places', () => {
    const prices = convertClearingPrices(
      { [USDC]: '1.5', [WETH]: '0.000000001939' },
      [USDC, WETH]
    );

    // maxDecimals = 12
    expect(prices[0]).toBe(1_500_000_000_000n); // 1.5 * 10^12
    expect(prices[1]).toBe(1_939n); // 0.000000001939 * 10^12
  });

  it('should respect token order', () => {
    const prices = convertClearingPrices(
      { [WETH]: '2000', [USDC]: '1' },
      [USDC, WETH] // USDC first
    );

    expect(prices[0]).toBe(1n); // USDC
    expect(prices[1]).toBe(2000n); // WETH
  });

  it('should throw for missing token price', () => {
    expect(() =>
      convertClearingPrices({ [USDC]: '1' }, [USDC, WETH])
    ).toThrow('Clearing price missing for token');
  });

  it('should be case-insensitive for token addresses', () => {
    const prices = convertClearingPrices(
      { [USDC.toUpperCase()]: '1' },
      [USDC.toLowerCase()]
    );
    expect(prices).toEqual([1n]);
  });
});

// ============ collectTokenAddresses Tests ============

describe('collectTokenAddresses', () => {
  it('should collect unique tokens from orders', () => {
    const tokens = collectTokenAddresses([
      {
        fromTokenAddress: USDC,
        toTokenAddress: WETH,
        owner: OWNER,
        receiver: OWNER,
        fromTokenAmount: '1000',
        toTokenAmount: '1',
        validTo: 9999999999,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: false,
        signingScheme: 'eip712',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [],
      },
    ]);

    expect(tokens).toEqual([USDC.toLowerCase(), WETH.toLowerCase()]);
  });

  it('should deduplicate tokens across orders', () => {
    const tokens = collectTokenAddresses([
      {
        fromTokenAddress: USDC,
        toTokenAddress: WETH,
        owner: OWNER,
        receiver: OWNER,
        fromTokenAmount: '1000',
        toTokenAmount: '1',
        validTo: 9999999999,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: false,
        signingScheme: 'eip712',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [],
      },
      {
        fromTokenAddress: WETH,
        toTokenAddress: DAI,
        owner: OWNER,
        receiver: OWNER,
        fromTokenAmount: '1',
        toTokenAmount: '1000',
        validTo: 9999999999,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: false,
        signingScheme: 'eip712',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [],
      },
    ]);

    expect(tokens).toEqual([
      USDC.toLowerCase(),
      WETH.toLowerCase(),
      DAI.toLowerCase(),
    ]);
  });
});

// ============ buildTradeFromSolveOrders Tests ============

describe('buildTradeFromSolveOrders', () => {
  const tokenIndexMap = new Map<string, number>([
    [USDC.toLowerCase(), 0],
    [WETH.toLowerCase(), 1],
  ]);

  it('should build trade for exactIn order', () => {
    const trade = buildTradeFromSolveOrders(
      {
        fromTokenAddress: USDC,
        toTokenAddress: WETH,
        owner: OWNER,
        receiver: RECEIVER,
        fromTokenAmount: '1000000000',
        toTokenAmount: '500000000',
        validTo: 1700000000,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: false,
        signingScheme: 'eip712',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [],
      },
      {
        executedFromTokenAmount: '1000000000',
        executedToTokenAmount: '510000000',
        commissionInfos: [],
        solverFeeInfo: {
          feePercent: '0',
          solverAddress: SOLVER,
          feeDirection: true,
          feeAmount: '0',
        },
      },
      tokenIndexMap
    );

    expect(trade.fromTokenAddressIndex).toBe(0);
    expect(trade.toTokenAddressIndex).toBe(1);
    expect(trade.owner).toBe(OWNER);
    expect(trade.receiver).toBe(RECEIVER); // Different from owner
    expect(trade.fromTokenAmount).toBe(1000000000n);
    expect(trade.toTokenAmount).toBe(500000000n);
    expect(trade.validTo).toBe(1700000000);
    expect(trade.appData).toBe(SAMPLE_APP_DATA);
    expect(trade.executedAmount).toBe(1000000000n); // exactIn → fromTokenAmount
    expect(trade.signature).toBe(SAMPLE_SIGNATURE);
  });

  it('should set receiver to ADDRESS_ZERO when same as owner', () => {
    const trade = buildTradeFromSolveOrders(
      {
        fromTokenAddress: USDC,
        toTokenAddress: WETH,
        owner: OWNER,
        receiver: OWNER, // Same as owner
        fromTokenAmount: '1000000000',
        toTokenAmount: '500000000',
        validTo: 1700000000,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: false,
        signingScheme: 'eip712',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [],
      },
      {
        executedFromTokenAmount: '1000000000',
        executedToTokenAmount: '510000000',
        commissionInfos: [],
        solverFeeInfo: {
          feePercent: '0',
          solverAddress: SOLVER,
          feeDirection: true,
          feeAmount: '0',
        },
      },
      tokenIndexMap
    );

    expect(trade.receiver).toBe(ADDRESS_ZERO);
  });

  it('should encode trade flags correctly', () => {
    // partiallyFillable=true, eip1271 scheme
    const trade = buildTradeFromSolveOrders(
      {
        fromTokenAddress: USDC,
        toTokenAddress: WETH,
        owner: OWNER,
        receiver: OWNER,
        fromTokenAmount: '1000',
        toTokenAmount: '500',
        validTo: 1700000000,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: true,
        signingScheme: 'eip1271',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [],
      },
      {
        executedFromTokenAmount: '500',
        executedToTokenAmount: '250',
        commissionInfos: [],
        solverFeeInfo: {
          feePercent: '0',
          solverAddress: SOLVER,
          feeDirection: true,
          feeAmount: '0',
        },
      },
      tokenIndexMap
    );

    // Expected: bit 1 (partiallyFillable) + bits 5-6 = 2 (eip1271)
    const expected = encodeTradeFlags(OrderKind.EXACT_IN, true, 2);
    expect(trade.flags).toBe(expected);
  });
});

// ============ buildSettleCalldata Integration Tests ============

describe('buildSettleCalldata', () => {
  const sampleRequest: SolveRequest = {
    auctionId: '12345',
    orders: [
      {
        fromTokenAddress: USDC,
        toTokenAddress: WETH,
        owner: OWNER,
        receiver: OWNER,
        fromTokenAmount: '1000000000',
        toTokenAmount: '500000000000000',
        validTo: 1700000000,
        appDataHash: SAMPLE_APP_DATA,
        swapMode: 'exactIn',
        partiallyFillable: false,
        signingScheme: 'eip712',
        signature: SAMPLE_SIGNATURE,
        commissionInfos: [
          {
            feePercent: '10000000',
            referrerWalletAddress: REFERRER,
            feeDirection: true,
            toB: false,
            commissionType: 'okx',
          },
        ],
      },
    ],
  };

  const sampleResponse: SolveResponse = {
    solutions: [
      {
        clearingPrices: {
          [USDC.toLowerCase()]: '1',
          [WETH.toLowerCase()]: '2000',
        },
        orders: [
          {
            executedFromTokenAmount: '1000000000',
            executedToTokenAmount: '510000000000000',
            commissionInfos: [
              {
                feePercent: '10000000',
                referrerWalletAddress: REFERRER,
                feeDirection: true,
                toB: false,
                commissionType: 'okx',
              },
            ],
            solverFeeInfo: {
              feePercent: '5000000',
              solverAddress: SOLVER,
              feeDirection: true,
              feeAmount: '50000',
            },
          },
        ],
        surplusFeeInfo: {
          feePercent: '9800000',
          trimReceiver: TRIM_RECEIVER,
          flag: '0',
        },
      },
    ],
  };

  it('should produce valid calldata that can be decoded', () => {
    const result = buildSettleCalldata(sampleRequest, sampleResponse);
    const { calldata } = result;

    expect(calldata).toMatch(/^0x/);

    // Decode the calldata back
    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', calldata);

    // Verify settleId
    expect(decoded.settleId.toString()).toBe('12345');

    // Verify tokens
    expect(decoded.tokens.length).toBe(2);
    expect(decoded.tokens[0].toLowerCase()).toBe(USDC.toLowerCase());
    expect(decoded.tokens[1].toLowerCase()).toBe(WETH.toLowerCase());

    // Verify clearing prices
    expect(decoded.clearingPrices.length).toBe(2);
    expect(decoded.clearingPrices[0].toString()).toBe('1');
    expect(decoded.clearingPrices[1].toString()).toBe('2000');

    // Verify trades
    expect(decoded.trades.length).toBe(1);
    const trade = decoded.trades[0];
    expect(trade.fromTokenAddressIndex.toString()).toBe('0');
    expect(trade.toTokenAddressIndex.toString()).toBe('1');
    expect(trade.owner).toBe(OWNER);
    expect(trade.receiver).toBe(ADDRESS_ZERO); // receiver === owner
    expect(trade.fromTokenAmount.toString()).toBe('1000000000');
    expect(trade.toTokenAmount.toString()).toBe('500000000000000');
    expect(trade.executedAmount.toString()).toBe('1000000000');

    // Verify commission infos
    expect(trade.commissionInfos.length).toBe(1);
    const ci = trade.commissionInfos[0];
    expect(ci.feePercent.toString()).toBe('10000000');
    expect(ci.referrerWalletAddress).toBe(REFERRER);

    // Verify solver fee info
    expect(trade.solverFeeInfo.feePercent.toString()).toBe('5000000');
    expect(trade.solverFeeInfo.solverAddr).toBe(SOLVER);

    // Verify surplus fee info
    expect(decoded.surplusFeeInfo.feePercent.toString()).toBe('9800000');
    expect(decoded.surplusFeeInfo.trimReceiver).toBe(TRIM_RECEIVER);
  });

  it('should return decoded params alongside calldata', () => {
    const result = buildSettleCalldata(sampleRequest, sampleResponse);

    expect(result.params.settleId).toBe(12345n);
    expect(result.params.tokens.length).toBe(2);
    expect(result.params.clearingPrices.length).toBe(2);
    expect(result.params.trades.length).toBe(1);
    expect(result.params.surplusFeeInfo.feePercent).toBe(9800000n);
  });

  it('should handle decimal clearing prices', () => {
    const request: SolveRequest = {
      auctionId: '99',
      orders: [
        {
          fromTokenAddress: USDC,
          toTokenAddress: WETH,
          owner: OWNER,
          receiver: OWNER,
          fromTokenAmount: '1000000',
          toTokenAmount: '500',
          validTo: 1700000000,
          appDataHash: SAMPLE_APP_DATA,
          swapMode: 'exactIn',
          partiallyFillable: false,
          signingScheme: 'eip712',
          signature: SAMPLE_SIGNATURE,
          commissionInfos: [],
        },
      ],
    };

    const response: SolveResponse = {
      solutions: [
        {
          clearingPrices: {
            [USDC.toLowerCase()]: '1',
            [WETH.toLowerCase()]: '0.000000001939',
          },
          orders: [
            {
              executedFromTokenAmount: '1000000',
              executedToTokenAmount: '500',
              commissionInfos: [],
              solverFeeInfo: {
                feePercent: '0',
                solverAddress: SOLVER,
                feeDirection: true,
                feeAmount: '0',
              },
            },
          ],
          surplusFeeInfo: {
            feePercent: '0',
            trimReceiver: TRIM_RECEIVER,
            flag: '0',
          },
        },
      ],
    };

    const result = buildSettleCalldata(request, response);

    // Verify clearing prices were scaled correctly
    // maxDecimals = 12, so USDC = 1 * 10^12 = 1000000000000, WETH = 1939
    expect(result.params.clearingPrices[0]).toBe(1_000_000_000_000n);
    expect(result.params.clearingPrices[1]).toBe(1939n);

    // Verify calldata is still decodable
    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);
    expect(decoded.clearingPrices[0].toString()).toBe('1000000000000');
    expect(decoded.clearingPrices[1].toString()).toBe('1939');
  });

  it('should use default empty interactions', () => {
    const result = buildSettleCalldata(sampleRequest, sampleResponse);

    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);

    // interactions should be [[], [], []]
    expect(decoded.interactions[0].length).toBe(0);
    expect(decoded.interactions[1].length).toBe(0);
    expect(decoded.interactions[2].length).toBe(0);
  });

  it('should pass custom interactions', () => {
    const result = buildSettleCalldata(sampleRequest, sampleResponse, {
      interactions: [
        [{ target: SOLVER, value: 0n, callData: '0x1234' }],
        [],
        [],
      ],
    });

    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);

    expect(decoded.interactions[0].length).toBe(1);
    expect(decoded.interactions[0][0].target).toBe(SOLVER);
  });

  it('should throw on empty solutions', () => {
    expect(() =>
      buildSettleCalldata(sampleRequest, { solutions: [] })
    ).toThrow('Response contains no solutions');
  });

  it('should throw on order count mismatch', () => {
    const badResponse: SolveResponse = {
      solutions: [
        {
          clearingPrices: {},
          orders: [], // Empty — mismatch with 1 request order
          surplusFeeInfo: { feePercent: '0', trimReceiver: TRIM_RECEIVER, flag: '0' },
        },
      ],
    };

    expect(() =>
      buildSettleCalldata(sampleRequest, badResponse)
    ).toThrow('Order count mismatch');
  });

  it('should select solution by index', () => {
    const multiSolutionResponse: SolveResponse = {
      solutions: [
        {
          clearingPrices: { [USDC.toLowerCase()]: '1', [WETH.toLowerCase()]: '1000' },
          orders: [
            {
              executedFromTokenAmount: '500',
              executedToTokenAmount: '250',
              commissionInfos: [],
              solverFeeInfo: { feePercent: '0', solverAddress: SOLVER, feeDirection: true, feeAmount: '0' },
            },
          ],
          surplusFeeInfo: { feePercent: '0', trimReceiver: TRIM_RECEIVER, flag: '0' },
        },
        {
          clearingPrices: { [USDC.toLowerCase()]: '1', [WETH.toLowerCase()]: '2000' },
          orders: [
            {
              executedFromTokenAmount: '1000',
              executedToTokenAmount: '500',
              commissionInfos: [],
              solverFeeInfo: { feePercent: '0', solverAddress: SOLVER, feeDirection: true, feeAmount: '0' },
            },
          ],
          surplusFeeInfo: { feePercent: '0', trimReceiver: TRIM_RECEIVER, flag: '0' },
        },
      ],
    };

    const result = buildSettleCalldata(sampleRequest, multiSolutionResponse, {
      solutionIndex: 1,
    });

    // Should use solution[1] prices
    expect(result.params.clearingPrices[1]).toBe(2000n);
    expect(result.params.trades[0].executedAmount).toBe(1000n);
  });
});

// ============ buildSettleCalldata Trade Sorting Tests ============

describe('buildSettleCalldata trade sorting by toTokenAddressIndex', () => {
  it('should sort trades by toTokenAddressIndex ascending (matching Settlement contract requirement)', () => {
    // Order 0: USDC → DAI  → tokens: [USDC(0), DAI(1)]
    // Order 1: WETH → USDC → tokens: [USDC(0), DAI(1), WETH(2)]
    // Before sort: [trade0(toIdx=1), trade1(toIdx=0)]
    // After sort:  [trade1(toIdx=0), trade0(toIdx=1)]
    const request: SolveRequest = {
      auctionId: '100',
      orders: [
        {
          fromTokenAddress: USDC,
          toTokenAddress: DAI,    // toIdx = 1
          owner: OWNER,
          receiver: OWNER,
          fromTokenAmount: '1000',
          toTokenAmount: '900',
          validTo: 1700000000,
          appDataHash: SAMPLE_APP_DATA,
          swapMode: 'exactIn',
          partiallyFillable: false,
          signingScheme: 'eip712',
          signature: SAMPLE_SIGNATURE,
          commissionInfos: [],
        },
        {
          fromTokenAddress: WETH,
          toTokenAddress: USDC,   // toIdx = 0
          owner: SOLVER,
          receiver: SOLVER,
          fromTokenAmount: '2000',
          toTokenAmount: '1800',
          validTo: 1700000000,
          appDataHash: SAMPLE_APP_DATA,
          swapMode: 'exactIn',
          partiallyFillable: false,
          signingScheme: 'eip712',
          signature: SAMPLE_SIGNATURE,
          commissionInfos: [],
        },
      ],
    };

    const response: SolveResponse = {
      solutions: [
        {
          clearingPrices: {
            [USDC.toLowerCase()]: '1',
            [DAI.toLowerCase()]: '1',
            [WETH.toLowerCase()]: '2',
          },
          orders: [
            {
              executedFromTokenAmount: '1000',
              executedToTokenAmount: '950',
              commissionInfos: [],
              solverFeeInfo: { feePercent: '0', solverAddress: SOLVER, feeDirection: true, feeAmount: '0' },
            },
            {
              executedFromTokenAmount: '2000',
              executedToTokenAmount: '1900',
              commissionInfos: [],
              solverFeeInfo: { feePercent: '0', solverAddress: SOLVER, feeDirection: true, feeAmount: '0' },
            },
          ],
          surplusFeeInfo: { feePercent: '0', trimReceiver: TRIM_RECEIVER, flag: '0' },
        },
      ],
    };

    const result = buildSettleCalldata(request, response);

    // Trades must be sorted: toTokenAddressIndex ascending
    expect(result.params.trades.length).toBe(2);
    expect(result.params.trades[0].toTokenAddressIndex).toBe(0); // USDC — was order 1
    expect(result.params.trades[1].toTokenAddressIndex).toBe(1); // DAI — was order 0

    // Verify owner mapping confirms the reorder
    expect(result.params.trades[0].owner).toBe(SOLVER);  // originally order 1
    expect(result.params.trades[1].owner).toBe(OWNER);   // originally order 0

    // Verify decoded calldata also has correct order
    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);
    expect(Number(decoded.trades[0].toTokenAddressIndex)).toBeLessThanOrEqual(
      Number(decoded.trades[1].toTokenAddressIndex)
    );
  });
});

// ============ computeCustomPrices Tests ============

describe('computeCustomPrices', () => {
  const noFeeCommissions: [] = [];
  const zeroSolverFee = {
    feePercent: '0',
    solverAddress: SOLVER,
    feeDirection: true,
    feeAmount: '0',
  };

  it('should compute prices for fromToken direction fees', () => {
    // eS = 1_000_000_000, eB = 500_000_000
    // Commission: 1% fromToken = 10_000_000 / 1e9
    // Solver fee: 0.5% fromToken = 5_000_000 / 1e9
    const eS = 1_000_000_000n;
    const eB = 500_000_000n;

    const result = computeCustomPrices(
      eS,
      eB,
      [
        {
          feePercent: '10000000', // 1%
          referrerWalletAddress: REFERRER,
          feeDirection: true,
          toB: false,
          commissionType: 'okx',
        },
      ],
      {
        feePercent: '5000000', // 0.5%
        solverAddress: SOLVER,
        feeDirection: true,
        feeAmount: '0',
      }
    );

    // fromTokenFee = floor(1e9 * 10_000_000 / 1e9) + floor(1e9 * 5_000_000 / 1e9)
    //             = 10_000_000 + 5_000_000 = 15_000_000
    expect(result.fromTokenFee).toBe(15_000_000n);
    expect(result.toTokenFee).toBe(0n);

    // P_s = eB = 500_000_000
    expect(result.customPriceSell).toBe(eB);
    // P_b = eS - fromTokenFee = 1_000_000_000 - 15_000_000 = 985_000_000
    expect(result.customPriceBuy).toBe(eS - 15_000_000n);
  });

  it('should compute prices for toToken direction fees', () => {
    // eS = 1_000_000_000, eB = 500_000_000
    // Commission: 2% toToken
    const eS = 1_000_000_000n;
    const eB = 500_000_000n;

    const result = computeCustomPrices(
      eS,
      eB,
      [
        {
          feePercent: '20000000', // 2%
          referrerWalletAddress: REFERRER,
          feeDirection: false,
          toB: false,
          commissionType: 'okx',
        },
      ],
      {
        feePercent: '0',
        solverAddress: SOLVER,
        feeDirection: false,
        feeAmount: '0',
      }
    );

    expect(result.fromTokenFee).toBe(0n);

    // P_b = eS = 1_000_000_000
    expect(result.customPriceBuy).toBe(eS);

    // toGross = floor(eB * DENOM / (DENOM - totalToPercent))
    // = floor(500_000_000 * 1e9 / (1e9 - 20_000_000))
    // = floor(500_000_000 * 1e9 / 980_000_000)
    // = floor(510_204_081.6...) = 510_204_081
    // toTokenFee = floor(510_204_081 * 20_000_000 / 1e9) = floor(10_204_081.62) = 10_204_081
    // payout = 510_204_081 - 10_204_081 = 500_000_000 >= eB ✓
    const expectedToGross = (eB * COMMISSION_DENOM) / (COMMISSION_DENOM - 20_000_000n);
    const expectedFee = (expectedToGross * 20_000_000n) / COMMISSION_DENOM;

    // P_s = toGross
    expect(result.customPriceSell).toBe(expectedToGross);
    expect(result.toTokenFee).toBe(expectedFee);

    // Verify constraint: toGross - toTokenFee >= eB
    expect(result.customPriceSell - result.toTokenFee).toBeGreaterThanOrEqual(eB);
  });

  it('should compute prices with no fees', () => {
    const eS = 1_000_000n;
    const eB = 2_000_000n;

    const result = computeCustomPrices(eS, eB, noFeeCommissions, zeroSolverFee);

    expect(result.customPriceSell).toBe(eB); // P_s = eB
    expect(result.customPriceBuy).toBe(eS);  // P_b = eS
    expect(result.fromTokenFee).toBe(0n);
    expect(result.toTokenFee).toBe(0n);
  });

  it('should throw on mixed fee directions', () => {
    expect(() =>
      computeCustomPrices(
        1_000_000n,
        500_000n,
        [
          {
            feePercent: '10000000',
            referrerWalletAddress: REFERRER,
            feeDirection: true, // fromToken
            toB: false,
            commissionType: 'okx',
          },
          {
            feePercent: '5000000',
            referrerWalletAddress: REFERRER,
            feeDirection: false, // toToken — mixed!
            toB: false,
            commissionType: 'parent',
          },
        ],
        {
          feePercent: '0',
          solverAddress: SOLVER,
          feeDirection: true,
          feeAmount: '0',
        }
      )
    ).toThrow('Mixed fee directions');
  });

  it('should handle toToken rounding edge case', () => {
    // Use amounts where floor division causes toGross - fee < eB initially
    // Small amounts amplify rounding effects
    const eS = 100n;
    const eB = 97n;
    // 3% toToken fee — totalToPercent = 30_000_000
    const result = computeCustomPrices(
      eS,
      eB,
      [
        {
          feePercent: '30000000', // 3%
          referrerWalletAddress: REFERRER,
          feeDirection: false,
          toB: false,
          commissionType: 'okx',
        },
      ],
      {
        feePercent: '0',
        solverAddress: SOLVER,
        feeDirection: false,
        feeAmount: '0',
      }
    );

    // Constraint must hold
    expect(result.customPriceSell - result.toTokenFee).toBeGreaterThanOrEqual(eB);
    expect(result.customPriceBuy).toBe(eS);
    expect(result.fromTokenFee).toBe(0n);
  });

  it('should handle multiple fromToken commission entries', () => {
    const eS = 1_000_000_000n;
    const eB = 500_000_000n;

    const result = computeCustomPrices(
      eS,
      eB,
      [
        {
          feePercent: '10000000', // 1%
          referrerWalletAddress: REFERRER,
          feeDirection: true,
          toB: false,
          commissionType: 'okx',
        },
        {
          feePercent: '5000000', // 0.5%
          referrerWalletAddress: REFERRER,
          feeDirection: true,
          toB: true,
          commissionType: 'parent',
        },
      ],
      {
        feePercent: '3000000', // 0.3%
        solverAddress: SOLVER,
        feeDirection: true,
        feeAmount: '0',
      }
    );

    // Each fee computed independently: floor(eS * pct / DENOM)
    const fee1 = (eS * 10_000_000n) / COMMISSION_DENOM; // 10_000_000
    const fee2 = (eS * 5_000_000n) / COMMISSION_DENOM;  // 5_000_000
    const fee3 = (eS * 3_000_000n) / COMMISSION_DENOM;  // 3_000_000
    const totalFee = fee1 + fee2 + fee3;

    expect(result.fromTokenFee).toBe(totalFee);
    expect(result.customPriceSell).toBe(eB);
    expect(result.customPriceBuy).toBe(eS - totalFee);
  });
});

// ============ buildClearingPricesFromCustomPrices Tests ============

describe('buildClearingPricesFromCustomPrices', () => {
  it('should build clearing prices from single order', () => {
    const orderPrices: OrderCustomPrice[] = [
      {
        fromTokenIndex: 0,
        toTokenIndex: 1,
        prices: {
          customPriceSell: 100n,
          customPriceBuy: 200n,
          fromTokenFee: 0n,
          toTokenFee: 0n,
        },
      },
    ];

    const result = buildClearingPricesFromCustomPrices(orderPrices, 2);
    expect(result).toEqual([100n, 200n]);
  });

  it('should build clearing prices from multiple orders with shared tokens', () => {
    // Order 0: USDC(0) → WETH(1)
    // Order 1: DAI(2) → WETH(1)  — WETH shared, must have same price
    const orderPrices: OrderCustomPrice[] = [
      {
        fromTokenIndex: 0,
        toTokenIndex: 1,
        prices: {
          customPriceSell: 100n, // USDC slot
          customPriceBuy: 200n,  // WETH slot
          fromTokenFee: 0n,
          toTokenFee: 0n,
        },
      },
      {
        fromTokenIndex: 2,
        toTokenIndex: 1,
        prices: {
          customPriceSell: 300n, // DAI slot
          customPriceBuy: 200n,  // WETH slot — same as order 0
          fromTokenFee: 0n,
          toTokenFee: 0n,
        },
      },
    ];

    const result = buildClearingPricesFromCustomPrices(orderPrices, 3);
    expect(result).toEqual([100n, 200n, 300n]);
  });

  it('should throw on conflicting prices for same token index', () => {
    const orderPrices: OrderCustomPrice[] = [
      {
        fromTokenIndex: 0,
        toTokenIndex: 1,
        prices: {
          customPriceSell: 100n,
          customPriceBuy: 200n,
          fromTokenFee: 0n,
          toTokenFee: 0n,
        },
      },
      {
        fromTokenIndex: 0,
        toTokenIndex: 2,
        prices: {
          customPriceSell: 999n, // Conflicts with order 0's P_s for index 0
          customPriceBuy: 300n,
          fromTokenFee: 0n,
          toTokenFee: 0n,
        },
      },
    ];

    expect(() =>
      buildClearingPricesFromCustomPrices(orderPrices, 3)
    ).toThrow('conflicting clearing prices');
  });

  it('should throw when a token index has no assigned price', () => {
    const orderPrices: OrderCustomPrice[] = [
      {
        fromTokenIndex: 0,
        toTokenIndex: 1,
        prices: {
          customPriceSell: 100n,
          customPriceBuy: 200n,
          fromTokenFee: 0n,
          toTokenFee: 0n,
        },
      },
    ];

    expect(() =>
      buildClearingPricesFromCustomPrices(orderPrices, 3) // tokenCount=3 but only indices 0,1 covered
    ).toThrow('no clearing price assigned');
  });
});

// ============ buildSettleCalldata with useComputedPrices Tests ============

describe('buildSettleCalldata with useComputedPrices', () => {
  it('should produce valid calldata with computed prices (no fees)', () => {
    const request: SolveRequest = {
      auctionId: '42',
      orders: [
        {
          fromTokenAddress: USDC,
          toTokenAddress: WETH,
          owner: OWNER,
          receiver: OWNER,
          fromTokenAmount: '1000000000',
          toTokenAmount: '500000000',
          validTo: 1700000000,
          appDataHash: SAMPLE_APP_DATA,
          swapMode: 'exactIn',
          partiallyFillable: false,
          signingScheme: 'eip712',
          signature: SAMPLE_SIGNATURE,
          commissionInfos: [],
        },
      ],
    };

    const response: SolveResponse = {
      solutions: [
        {
          clearingPrices: {}, // Not used when useComputedPrices=true
          orders: [
            {
              executedFromTokenAmount: '1000000000',
              executedToTokenAmount: '510000000',
              commissionInfos: [],
              solverFeeInfo: {
                feePercent: '0',
                solverAddress: SOLVER,
                feeDirection: true,
                feeAmount: '0',
              },
            },
          ],
          surplusFeeInfo: {
            feePercent: '0',
            trimReceiver: TRIM_RECEIVER,
            flag: '0',
          },
        },
      ],
    };

    const result = buildSettleCalldata(request, response, {
      useComputedPrices: true,
    });

    // No fees: P_s = eB = 510_000_000, P_b = eS = 1_000_000_000
    expect(result.params.clearingPrices[0]).toBe(510_000_000n); // USDC = P_s
    expect(result.params.clearingPrices[1]).toBe(1_000_000_000n); // WETH = P_b

    // Verify calldata is decodable
    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);
    expect(decoded.clearingPrices[0].toString()).toBe('510000000');
    expect(decoded.clearingPrices[1].toString()).toBe('1000000000');
  });

  it('should produce valid calldata with fromToken fees', () => {
    const request: SolveRequest = {
      auctionId: '43',
      orders: [
        {
          fromTokenAddress: USDC,
          toTokenAddress: WETH,
          owner: OWNER,
          receiver: OWNER,
          fromTokenAmount: '1000000000',
          toTokenAmount: '500000000',
          validTo: 1700000000,
          appDataHash: SAMPLE_APP_DATA,
          swapMode: 'exactIn',
          partiallyFillable: false,
          signingScheme: 'eip712',
          signature: SAMPLE_SIGNATURE,
          commissionInfos: [
            {
              feePercent: '10000000', // 1%
              referrerWalletAddress: REFERRER,
              feeDirection: true,
              toB: false,
              commissionType: 'okx',
            },
          ],
        },
      ],
    };

    const response: SolveResponse = {
      solutions: [
        {
          clearingPrices: {},
          orders: [
            {
              executedFromTokenAmount: '1000000000',
              executedToTokenAmount: '510000000',
              commissionInfos: [
                {
                  feePercent: '10000000',
                  referrerWalletAddress: REFERRER,
                  feeDirection: true,
                  toB: false,
                  commissionType: 'okx',
                },
              ],
              solverFeeInfo: {
                feePercent: '5000000', // 0.5%
                solverAddress: SOLVER,
                feeDirection: true,
                feeAmount: '0',
              },
            },
          ],
          surplusFeeInfo: {
            feePercent: '0',
            trimReceiver: TRIM_RECEIVER,
            flag: '0',
          },
        },
      ],
    };

    const result = buildSettleCalldata(request, response, {
      useComputedPrices: true,
    });

    // fromTokenFee = floor(1e9 * 10_000_000 / 1e9) + floor(1e9 * 5_000_000 / 1e9) = 15_000_000
    // P_s = eB = 510_000_000
    // P_b = eS - fee = 1_000_000_000 - 15_000_000 = 985_000_000
    expect(result.params.clearingPrices[0]).toBe(510_000_000n);
    expect(result.params.clearingPrices[1]).toBe(985_000_000n);

    // Verify decodable
    const iface = new ethers.utils.Interface(SETTLEMENT_ABI);
    const decoded = iface.decodeFunctionData('settle', result.calldata);
    expect(decoded.clearingPrices.length).toBe(2);
  });
});
