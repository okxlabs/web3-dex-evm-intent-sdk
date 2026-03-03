/**
 * E2E Staging Test — ETH Mainnet
 *
 * Mirrors `script/E2EStaging.s.sol` using the TypeScript SDK.
 * Connects to ETH mainnet staging environment, executes 5 trade scenarios
 * through Uniswap V3 to verify the Settlement contract end-to-end.
 *
 * Scenarios:
 *   1. Order without commission
 *   2. Order with 1% commission (referral fee)
 *   3. Order with commission + solver fee (0.5% each)
 *   4. Order with surplus fee (50% to surplus receiver)
 *   5. Order invalidation
 *
 * Prereqs:
 *   - .env with RPC_URL, PK, SOLVER_PK
 *   - deployments/eth_stg.json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

import {
  CommissionFlags,
  EthersV5Adapter,
  OrderKind,
  OrderSigningUtils,
  SETTLEMENT_ABI,
  SigningScheme,
  SupportedChainId,
  TradingSdk,
  ZERO_BYTES32,
  RECEIVER_SAME_AS_OWNER,
  getCurrentTimestamp,
  DEFAULT_ORDER_VALIDITY,
  encodeTradeFlags,
  packOrderUid,
} from '@okx-intent-swap/sdk';
import type {
  Order,
  Trade,
  CommissionInfo,
  SolverFeeInfo,
  SurplusFeeInfo,
  Interaction,
} from '@okx-intent-swap/sdk';

// ============ Types ============

interface Deployments {
  approveProxy: string;
  dexRouter: string;
  settlement: string;
  solver: string;
  surplusfee_receiver: string;
  tokenApprove: string;
  tokenA: string; // WETH
  tokenB: string; // USDT
}

// ============ Constants ============

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

const COMMISSION_DENOM = 1_000_000_000n;

// Clearing prices: ETH ~ $2000
// tokens array: [WETH, USDT, WETH, USDT], trade uses index 2/3
// payout_USDT = (executedAmount * fromPrice) / toPrice
// For 1e11 wei WETH at $2000: payout = (1e11 * 200) / 1e11 = 200 USDT units (0.0002 USDT)
const CLEARING_PRICES = [200n, 100_000_000_000n, 200n, 100_000_000_000n];

const FROM_AMOUNT = ethers.utils.parseEther('0.0000001').toBigInt(); // 1e11 wei

const ERC20_MIN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];

// ============ Environment ============

function loadEnv(): { rpcUrl: string; traderPk: string; solverPk: string } {
  const rpcUrl = process.env.RPC_URL;
  const traderPk = process.env.PK;
  const solverPk = process.env.SOLVER_PK;

  if (!rpcUrl) throw new Error('Missing RPC_URL in .env');
  if (!traderPk) throw new Error('Missing PK in .env');
  if (!solverPk) throw new Error('Missing SOLVER_PK in .env');

  return { rpcUrl, traderPk, solverPk };
}

function loadDeployments(): Deployments {
  const deploymentsPath =
    process.env.DEPLOYMENTS_PATH ||
    path.resolve(process.cwd(), '../../../deployments/eth_stg.json');

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`Deployments file not found: ${deploymentsPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
}

// ============ Helpers ============

function buildTokensArray(): string[] {
  // [WETH, USDT, WETH, USDT] — trade uses index 2 (fromToken) / 3 (toToken)
  return [WETH, USDT, WETH, USDT];
}

/**
 * Build pre-swap and swap interactions via Uniswap V3.
 * interactions[0] = pre-swap (approve WETH to router)
 * interactions[1] = swap (exactInputSingle WETH → USDT, recipient = settlement)
 * interactions[2] = post-swap (empty)
 */
function buildUniswapInteractions(
  amountIn: bigint,
  settlementAddress: string,
): Interaction[][] {
  const erc20Interface = new ethers.utils.Interface([
    'function approve(address spender, uint256 amount)',
  ]);

  const approveCallData = erc20Interface.encodeFunctionData('approve', [
    UNISWAP_V3_ROUTER,
    amountIn,
  ]);

  // Encode ExactInputSingleParams as a tuple
  const routerInterface = new ethers.utils.Interface([
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  ]);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const swapCallData = routerInterface.encodeFunctionData('exactInputSingle', [
    {
      tokenIn: WETH,
      tokenOut: USDT,
      fee: 3000, // 0.3% pool
      recipient: settlementAddress,
      deadline,
      amountIn,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    },
  ]);

  const preSwap: Interaction[] = [
    { target: WETH, value: 0n, callData: approveCallData },
  ];

  const swap: Interaction[] = [
    { target: UNISWAP_V3_ROUTER, value: 0n, callData: swapCallData },
  ];

  const postSwap: Interaction[] = [];

  return [preSwap, swap, postSwap];
}

function buildOrder(
  fromAmount: bigint,
  toAmount: bigint,
  commissionInfos: CommissionInfo[],
  appData: string,
  owner: string,
): Order {
  return {
    fromTokenAddress: WETH,
    toTokenAddress: USDT,
    receiver: RECEIVER_SAME_AS_OWNER,
    fromTokenAmount: fromAmount,
    toTokenAmount: toAmount,
    validTo: getCurrentTimestamp() + DEFAULT_ORDER_VALIDITY,
    appData,
    swapMode: OrderKind.EXACT_IN,
    partiallyFillable: false,
    owner,
    commissionInfos,
  };
}

function buildTrade(
  order: Order,
  signature: string,
  commissionInfos: CommissionInfo[],
  solverFeeInfo: SolverFeeInfo,
): Trade {
  return {
    fromTokenAddressIndex: 2,
    toTokenAddressIndex: 3,
    owner: order.owner,
    receiver: order.receiver,
    fromTokenAmount: order.fromTokenAmount,
    toTokenAmount: order.toTokenAmount,
    validTo: order.validTo,
    appData: order.appData,
    flags: encodeTradeFlags(OrderKind.EXACT_IN, false, SigningScheme.EIP712),
    executedAmount: order.fromTokenAmount,
    commissionInfos,
    signature,
    solverFeeInfo,
  };
}

function noSolverFee(): SolverFeeInfo {
  return {
    feePercent: 0n,
    solverAddr: ethers.constants.AddressZero,
    flag: 0n,
  };
}

function noSurplusFee(): SurplusFeeInfo {
  return {
    feePercent: 0n,
    trimReceiver: ethers.constants.AddressZero,
    flag: 0n,
  };
}

/**
 * Encode settle() calldata and broadcast via solver wallet.
 * Returns parsed receipt.
 */
async function executeSettle(
  settlement: ethers.Contract,
  solverWallet: ethers.Wallet,
  settleId: number,
  trades: Trade[],
  interactions: Interaction[][],
  surplusFeeInfo: SurplusFeeInfo,
): Promise<ethers.providers.TransactionReceipt> {
  const tokens = buildTokensArray();
  const prices = CLEARING_PRICES.map((p) => p.toString());

  const settleData = settlement.interface.encodeFunctionData('settle', [
    settleId,
    tokens,
    prices,
    trades,
    interactions,
    surplusFeeInfo,
  ]);

  const tx = await solverWallet.sendTransaction({
    to: settlement.address,
    data: settleData,
    gasLimit: 3_000_000,
  });

  console.log(`  tx sent: ${tx.hash}`);
  const receipt = await tx.wait(1);

  if (receipt.status !== 1) {
    throw new Error(`settle reverted. txHash=${receipt.transactionHash}`);
  }

  return receipt;
}

/**
 * Parse and print relevant events from a settlement transaction receipt.
 */
function parseEvents(
  receipt: ethers.providers.TransactionReceipt,
  settlement: ethers.Contract,
): void {
  const iface = settlement.interface;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      switch (parsed.name) {
        case 'Trade':
          console.log(`  [Event] Trade — owner: ${parsed.args.owner}`);
          break;
        case 'CommissionFeePaid':
          console.log(
            `  [Event] CommissionFeePaid — receiver: ${parsed.args.receiver}, amount: ${parsed.args.amount}`,
          );
          break;
        case 'SolverFeePaid':
          console.log(
            `  [Event] SolverFeePaid — solver: ${parsed.args.solver}, amount: ${parsed.args.amount}`,
          );
          break;
        case 'SurplusFeePaid':
          console.log(
            `  [Event] SurplusFeePaid — receiver: ${parsed.args.receiver}, amount: ${parsed.args.amount}`,
          );
          break;
        case 'OrderInvalidated':
          console.log(
            `  [Event] OrderInvalidated — owner: ${parsed.args.owner}`,
          );
          break;
        default:
          // skip other events
          break;
      }
    } catch {
      // log from a different contract (e.g. ERC20 Transfer) — skip
    }
  }
}

// ============ Scenarios ============

/**
 * Scenario 1: Order without commission
 */
async function scenario1_NoCommission(
  sdk: TradingSdk,
  settlement: ethers.Contract,
  solverWallet: ethers.Wallet,
  traderAddress: string,
): Promise<void> {
  console.log('\n=== Scenario 1: Order without Commission ===');

  const order = buildOrder(FROM_AMOUNT, 1n, [], ZERO_BYTES32, traderAddress);
  const signedOrder = await sdk.signOrder(order, SigningScheme.EIP712);

  console.log(`  Order UID: ${signedOrder.uid}`);

  const trade = buildTrade(order, signedOrder.signature, [], noSolverFee());
  const interactions = buildUniswapInteractions(FROM_AMOUNT, settlement.address);

  const receipt = await executeSettle(
    settlement,
    solverWallet,
    1,
    [trade],
    interactions,
    noSurplusFee(),
  );

  parseEvents(receipt, settlement);
  console.log('  Scenario 1 completed successfully');
}

/**
 * Scenario 2: Order with 1% commission (referral fee)
 * Commission: 1% (10_000_000) from fromToken, ToB mode, receiver = 0xDeaD
 */
async function scenario2_WithCommission(
  sdk: TradingSdk,
  settlement: ethers.Contract,
  solverWallet: ethers.Wallet,
  traderAddress: string,
): Promise<void> {
  console.log('\n=== Scenario 2: Order with 1% Commission ===');

  const commissionInfos: CommissionInfo[] = [
    {
      feePercent: 10_000_000n, // 1%
      referrerWalletAddress: '0x000000000000000000000000000000000000dEaD',
      flag: CommissionFlags.FROM_TOKEN_COMMISSION | CommissionFlags.IS_TO_B,
    },
  ];

  const order = buildOrder(FROM_AMOUNT, 1n, commissionInfos, ZERO_BYTES32, traderAddress);
  const signedOrder = await sdk.signOrder(order, SigningScheme.EIP712);

  console.log(`  Order UID: ${signedOrder.uid}`);

  const trade = buildTrade(order, signedOrder.signature, commissionInfos, noSolverFee());

  // Net amount after 1% commission
  const commission = (FROM_AMOUNT * 10_000_000n) / COMMISSION_DENOM;
  const netFromAmount = FROM_AMOUNT - commission;
  console.log(`  Commission: ${commission} wei WETH to 0xDeaD`);
  console.log(`  Net swap amount: ${netFromAmount} wei`);

  const interactions = buildUniswapInteractions(netFromAmount, settlement.address);

  const receipt = await executeSettle(
    settlement,
    solverWallet,
    2,
    [trade],
    interactions,
    noSurplusFee(),
  );

  parseEvents(receipt, settlement);
  console.log('  Scenario 2 completed successfully');
}

/**
 * Scenario 3: Commission + Solver Fee
 * Commission: 0.5% (5_000_000) referral fee, FROM_TOKEN + IS_TO_B
 * Solver fee: 0.5% (5_000_000) to solver, FROM_TOKEN + IS_TO_B
 */
async function scenario3_CommissionAndSolverFee(
  sdk: TradingSdk,
  settlement: ethers.Contract,
  solverWallet: ethers.Wallet,
  traderAddress: string,
): Promise<void> {
  console.log('\n=== Scenario 3: Commission + Solver Fee ===');

  const commissionInfos: CommissionInfo[] = [
    {
      feePercent: 5_000_000n, // 0.5%
      referrerWalletAddress: '0x000000000000000000000000000000000000dEaD',
      flag: CommissionFlags.FROM_TOKEN_COMMISSION | CommissionFlags.IS_TO_B,
    },
  ];

  const solverFeeInfo: SolverFeeInfo = {
    feePercent: 5_000_000n, // 0.5%
    solverAddr: solverWallet.address,
    flag: CommissionFlags.FROM_TOKEN_COMMISSION | CommissionFlags.IS_TO_B,
  };

  const order = buildOrder(FROM_AMOUNT, 1n, commissionInfos, ZERO_BYTES32, traderAddress);
  const signedOrder = await sdk.signOrder(order, SigningScheme.EIP712);

  console.log(`  Order UID: ${signedOrder.uid}`);

  const trade = buildTrade(order, signedOrder.signature, commissionInfos, solverFeeInfo);

  // Net amount after commission (0.5%) + solver fee (0.5%) = 1%
  const commission = (FROM_AMOUNT * 5_000_000n) / COMMISSION_DENOM;
  const solverFee = (FROM_AMOUNT * 5_000_000n) / COMMISSION_DENOM;
  const netFromAmount = FROM_AMOUNT - commission - solverFee;
  console.log(`  Commission: ${commission} wei WETH to 0xDeaD`);
  console.log(`  Solver fee: ${solverFee} wei WETH to ${solverWallet.address}`);
  console.log(`  Net swap amount: ${netFromAmount} wei`);

  const interactions = buildUniswapInteractions(netFromAmount, settlement.address);

  const receipt = await executeSettle(
    settlement,
    solverWallet,
    3,
    [trade],
    interactions,
    noSurplusFee(),
  );

  parseEvents(receipt, settlement);
  console.log('  Scenario 3 completed successfully');
}

/**
 * Scenario 4: Surplus Fee
 * No commission; surplus fee = 50% of surplus to surplusfee_receiver.
 * Uses appData=4 to create a unique order (avoids "order already filled").
 */
async function scenario4_SurplusFee(
  sdk: TradingSdk,
  settlement: ethers.Contract,
  solverWallet: ethers.Wallet,
  traderAddress: string,
  surplusFeeReceiver: string,
): Promise<void> {
  console.log('\n=== Scenario 4: Surplus Fee ===');

  // appData = bytes32(uint256(4)) to ensure a unique order hash
  const appData = ethers.utils.hexZeroPad('0x04', 32);

  const order = buildOrder(FROM_AMOUNT, 1n, [], appData, traderAddress);
  const signedOrder = await sdk.signOrder(order, SigningScheme.EIP712);

  console.log(`  Order UID: ${signedOrder.uid}`);

  const trade = buildTrade(order, signedOrder.signature, [], noSolverFee());

  // Swap full amount — surplus comes from Uniswap giving more than clearing price payout
  const interactions = buildUniswapInteractions(FROM_AMOUNT, settlement.address);

  const surplusFeeInfo: SurplusFeeInfo = {
    feePercent: 500_000_000n, // 50% of surplus
    trimReceiver: surplusFeeReceiver,
    flag: 0n,
  };

  const receipt = await executeSettle(
    settlement,
    solverWallet,
    4,
    [trade],
    interactions,
    surplusFeeInfo,
  );

  parseEvents(receipt, settlement);
  console.log(`  SurplusFee: 50% to ${surplusFeeReceiver}`);
  console.log('  Scenario 4 completed successfully');
}

/**
 * Scenario 5: Order Invalidation
 * Sign an order, compute its UID, then call invalidateOrder() from the owner.
 * No actual settlement occurs.
 */
async function scenario5_OrderInvalidation(
  sdk: TradingSdk,
  settlement: ethers.Contract,
  traderAddress: string,
): Promise<void> {
  console.log('\n=== Scenario 5: Order Invalidation ===');

  // appData = bytes32(uint256(5)) for a unique order
  const appData = ethers.utils.hexZeroPad('0x05', 32);

  const order = buildOrder(FROM_AMOUNT, 1n, [], appData, traderAddress);
  const signedOrder = await sdk.signOrder(order, SigningScheme.EIP712);

  console.log(`  Order UID: ${signedOrder.uid}`);

  // Invalidate via SDK (sends tx from trader)
  const receipt = await sdk.invalidateOrder(signedOrder.uid);

  console.log(`  tx: ${receipt.transactionHash}`);

  // Check for OrderInvalidated event
  const iface = settlement.interface;
  let found = false;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === 'OrderInvalidated') {
        console.log(`  [Event] OrderInvalidated — owner: ${parsed.args.owner}`);
        found = true;
      }
    } catch {
      // skip
    }
  }

  if (!found) {
    console.warn('  WARNING: OrderInvalidated event not found in receipt');
  }

  console.log('  Scenario 5 completed successfully');
}

// ============ Main ============

async function main() {
  console.log('=== IntentSwap SDK E2E Staging (ETH Mainnet) ===\n');

  // Load configuration
  const env = loadEnv();
  const deployments = loadDeployments();

  console.log('Settlement:', deployments.settlement);
  console.log('ApproveProxy:', deployments.approveProxy);
  console.log('TokenApprove:', deployments.tokenApprove);
  console.log('SurplusFeeReceiver:', deployments.surplusfee_receiver);
  console.log('WETH:', WETH);
  console.log('USDT:', USDT);

  // Setup provider and wallets
  const provider = new ethers.providers.JsonRpcProvider(env.rpcUrl);
  const traderWallet = new ethers.Wallet(env.traderPk, provider);
  const solverWallet = new ethers.Wallet(env.solverPk, provider);

  console.log('Trader:', traderWallet.address);
  console.log('Solver:', solverWallet.address);

  // Verify chain
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId);
  if (network.chainId !== 1) {
    throw new Error(`Expected chainId=1 (ETH mainnet), got ${network.chainId}`);
  }

  // Init SDK — trader signs orders
  const traderAdapter = new EthersV5Adapter({ provider, signer: traderWallet });
  const sdk = new TradingSdk(
    {
      chainId: SupportedChainId.MAINNET,
      appCode: 'e2e-staging',
      settlementAddress: deployments.settlement,
      tokenApproveProxyAddress: deployments.approveProxy,
    },
    traderAdapter,
  );

  // Settlement contract instance (read-only; solver sends raw tx)
  const settlement = new ethers.Contract(
    deployments.settlement,
    SETTLEMENT_ABI as any,
    provider,
  );

  // Ensure approvals: trader WETH → TokenApprove
  console.log('\n--- Checking approvals ---');
  const weth = new ethers.Contract(WETH, ERC20_MIN_ABI, traderWallet);
  const allowance: ethers.BigNumber = await weth.allowance(
    traderWallet.address,
    deployments.tokenApprove,
  );
  const balance: ethers.BigNumber = await weth.balanceOf(traderWallet.address);

  console.log('Trader WETH balance:', ethers.utils.formatEther(balance));
  console.log('Trader WETH allowance to TokenApprove:', allowance.toString());

  // Need at least 0.0000004 ether for 4 swap orders
  const requiredAmount = ethers.utils.parseEther('0.0000004');
  if (balance.lt(requiredAmount)) {
    throw new Error(
      `Insufficient WETH balance. Need ${ethers.utils.formatEther(requiredAmount)}, have ${ethers.utils.formatEther(balance)}`,
    );
  }

  if (allowance.lt(requiredAmount)) {
    console.log('Approving TokenApprove to spend WETH...');
    const approveTx = await weth.approve(
      deployments.tokenApprove,
      ethers.constants.MaxUint256,
    );
    await approveTx.wait(1);
    console.log('Approval completed');
  } else {
    console.log('Sufficient allowance already exists');
  }

  // Execute 5 scenarios
  await scenario1_NoCommission(sdk, settlement, solverWallet, traderWallet.address);
  await scenario2_WithCommission(sdk, settlement, solverWallet, traderWallet.address);
  await scenario3_CommissionAndSolverFee(sdk, settlement, solverWallet, traderWallet.address);
  await scenario4_SurplusFee(
    sdk,
    settlement,
    solverWallet,
    traderWallet.address,
    deployments.surplusfee_receiver,
  );
  await scenario5_OrderInvalidation(sdk, settlement, traderWallet.address);

  console.log('\n=== All 5 E2E staging scenarios completed ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
