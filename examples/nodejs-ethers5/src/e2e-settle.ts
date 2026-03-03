/**
 * E2E test against local Anvil + Foundry deploy.
 *
 * Prereqs:
 * - Start anvil on http://127.0.0.1:8545 (chainId 31337)
 * - Run: forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
 * - Ensure deployments/anvil.json exists
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ethers } from 'ethers';

import {
  EthersV5Adapter,
  OrderKind,
  OrderSigningUtils,
  SETTLEMENT_ABI,
  SigningScheme,
  SupportedChainId,
  TradingSdk,
} from '@okx-intent-swap/sdk';

type Deployments = {
  auth: string;
  approveProxy: string;
  settlement: string;
  solver: string;
  trader: string;
  tokenA: string;
  tokenB: string;
};

const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
const DEPLOYMENTS_PATH =
  process.env.DEPLOYMENTS_PATH ||
  // When invoked from the SDK workspace root, this resolves to `<repo>/deployments/anvil.json`.
  path.resolve(process.cwd(), '../deployments/anvil.json');

// Default Anvil keys:
// https://book.getfoundry.sh/anvil/#default-wallet
const SOLVER_PK =
  process.env.SOLVER_PK ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TRADER_PK =
  process.env.TRADER_PK ||
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const ERC20_MIN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function mint(address,uint256)',
];

async function main() {
  console.log('--- IntentSwap SDK E2E (Anvil) ---');
  console.log('RPC:', ANVIL_RPC_URL);
  console.log('Deployments:', DEPLOYMENTS_PATH);

  const deployments: Deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'));

  const provider = new ethers.providers.JsonRpcProvider(ANVIL_RPC_URL);
  const solverWallet = new ethers.Wallet(SOLVER_PK, provider);
  const traderWallet = new ethers.Wallet(TRADER_PK, provider);

  console.log('Solver:', solverWallet.address);
  console.log('Trader:', traderWallet.address);

  if (deployments.solver.toLowerCase() !== solverWallet.address.toLowerCase()) {
    throw new Error(`deployments.solver != solverWallet.address`);
  }
  if (deployments.trader.toLowerCase() !== traderWallet.address.toLowerCase()) {
    throw new Error(`deployments.trader != traderWallet.address`);
  }

  const tokenA = new ethers.Contract(deployments.tokenA, ERC20_MIN_ABI, traderWallet);
  const tokenB = new ethers.Contract(deployments.tokenB, ERC20_MIN_ABI, traderWallet);
  const tokenBAsSolver = new ethers.Contract(deployments.tokenB, ERC20_MIN_ABI, solverWallet);

  // Ensure proxy is approved to pull tokenA from trader
  const allowance: ethers.BigNumber = await tokenA.allowance(traderWallet.address, deployments.approveProxy);
  if (allowance.lt(ethers.constants.MaxUint256.div(2))) {
    console.log('Approving MockTokenApproveProxy...');
    const tx = await tokenA.approve(deployments.approveProxy, ethers.constants.MaxUint256);
    await tx.wait(1);
  }

  // SDK wiring (local chainId)
  const adapter = new EthersV5Adapter({ provider, signer: traderWallet });
  const sdk = new TradingSdk(
    {
      chainId: SupportedChainId.ANVIL,
      appCode: 'e2e-anvil',
      settlementAddress: deployments.settlement,
      tokenApproveProxyAddress: deployments.approveProxy,
    },
    adapter
  );

  // Build and sign order
  const sellAmount = ethers.utils.parseEther('100').toBigInt();
  const buyAmount = ethers.utils.parseEther('100').toBigInt();

  const order = await sdk.buildOrder({
    swapMode: OrderKind.EXACT_IN,
    fromTokenAddress: deployments.tokenA,
    toTokenAddress: deployments.tokenB,
    fromTokenAmount: sellAmount,
    toTokenAmount: buyAmount,
    // receiver defaults to same-as-owner (address(0)) which matches onchain logic
    commissionInfos: [],
  });

  const signedOrder = await sdk.signOrder(order, SigningScheme.EIP712);

  console.log('Order UID:', signedOrder.uid);
  console.log('Order digest:', signedOrder.orderDigest);
  console.log('Signature:', signedOrder.signature);

  // Sanity-check: recover signer from digest (matches on-chain verification)
  {
    const domain = OrderSigningUtils.getDomain(SupportedChainId.ANVIL, deployments.settlement);
    console.log('TypedData domain:', domain);
    const types = OrderSigningUtils.getOrderTypes();
    const message = OrderSigningUtils.orderToMessage(order);
    const settlementRead = new ethers.Contract(deployments.settlement, SETTLEMENT_ABI as any, provider);
    const onchainDomainSeparator: string = await settlementRead.domainSeparator();
    const digest = OrderSigningUtils.computeOrderDigestFromDomainSeparator(order, onchainDomainSeparator);
    const recovered = ethers.utils.recoverAddress(digest, signedOrder.signature);
    console.log('Recovered signer (digest):', recovered);

    const offchainDomainSeparator: string = (ethers.utils as any)._TypedDataEncoder.hashDomain(domain as any);
    const manualDomainType = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
    const manualDomainTypeHash = ethers.utils.id(manualDomainType);
    const nameHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(domain.name!));
    const versionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(domain.version!));
    const manualEncoded = ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [manualDomainTypeHash, nameHash, versionHash, domain.chainId, domain.verifyingContract]
    );
    const manualDomainSeparator = ethers.utils.keccak256(manualEncoded);
    console.log('domainSeparator onchain :', onchainDomainSeparator);
    console.log('domainSeparator offchain:', offchainDomainSeparator);
    console.log('domainSeparator manual  :', manualDomainSeparator);

    const encoder = (ethers.utils as any)._TypedDataEncoder.from(types as any);
    const encodedType = encoder.encodeType('Order');
    const typeHash = ethers.utils.id(encodedType);
    const expectedType =
      'Order(address fromTokenAddress,address toTokenAddress,address owner,address receiver,uint256 fromTokenAmount,uint256 toTokenAmount,uint32 validTo,bytes32 appData,bytes32 swapMode,bool partiallyFillable,CommissionInfo[] commissionInfos)CommissionInfo(uint256 feePercent,address referrerWalletAddress,uint256 flag)';
    const expectedTypeHash = ethers.utils.id(expectedType);
    console.log('EIP712 encodeType(Order):', encodedType);
    console.log('EIP712 typeHash(Order):', typeHash);
    console.log('Expected typeHash(OrderLib.TYPE_HASH):', expectedTypeHash);
  }

  // Prepare settle() call as solver
  const settlement = new ethers.Contract(deployments.settlement, SETTLEMENT_ABI as any, solverWallet);

  const tokens = [deployments.tokenA, deployments.tokenB];
  const prices = [ethers.utils.parseEther('1'), ethers.utils.parseEther('1')]; // 1:1 for test

  const trades = [
    {
      fromTokenAddressIndex: 0,
      toTokenAddressIndex: 1,
      owner: signedOrder.owner,
      receiver: ethers.constants.AddressZero,
      fromTokenAmount: ethers.utils.parseEther('100'),
      toTokenAmount: ethers.utils.parseEther('100'),
      validTo: order.validTo,
      appData: order.appData,
      flags: 0, // EXACT_IN + fill-or-kill + EIP712
      executedAmount: ethers.utils.parseEther('100'),
      commissionInfos: [],
      signature: signedOrder.signature,
      solverFeeInfo: {
        feePercent: 0,
        solverAddr: ethers.constants.AddressZero,
        flag: 0,
      },
    },
  ];

  const interactions: any = [[], [], []];
  const surplusFeeInfo = {
    feePercent: 0,
    trimReceiver: ethers.constants.AddressZero,
    flag: 0,
  };

  const tokenABefore: ethers.BigNumber = await tokenA.balanceOf(traderWallet.address);
  const tokenBBefore: ethers.BigNumber = await tokenB.balanceOf(traderWallet.address);
  const settlementTokenBBefore: ethers.BigNumber = await tokenB.balanceOf(deployments.settlement);

  // Make the test repeatable: ensure Settlement has enough tokenB to pay + surplus.
  const desiredSettlementTokenB = ethers.utils.parseEther('2000');
  if (settlementTokenBBefore.lt(desiredSettlementTokenB)) {
    const delta = desiredSettlementTokenB.sub(settlementTokenBBefore);
    console.log('Topping up Settlement tokenB by:', ethers.utils.formatEther(delta));
    const tx = await tokenBAsSolver.mint(deployments.settlement, delta);
    await tx.wait(1);
  }

  console.log('Balances before:');
  console.log('  tokenA:', ethers.utils.formatEther(tokenABefore));
  console.log('  tokenB:', ethers.utils.formatEther(tokenBBefore));

  console.log('Calling settle() as solver...');
  const settleData = settlement.interface.encodeFunctionData('settle', [
    1,
    tokens,
    prices,
    trades,
    interactions,
    surplusFeeInfo,
  ]);
  console.log('settle calldata:', settleData.slice(0, 66) + '...');

  // Send with explicit gasLimit to bypass estimateGas (we want a tx hash even on revert)
  const settleTx = await solverWallet.sendTransaction({
    to: deployments.settlement,
    data: settleData,
    gasLimit: 12_000_000,
  });
  const receipt = await settleTx.wait(1);

  console.log('settle tx:', receipt.transactionHash, 'status:', receipt.status);
  if (receipt.status !== 1) {
    throw new Error(`settle reverted. txHash=${receipt.transactionHash}`);
  }

  // Print full execution trace using Foundry `cast run`.
  // You can pass extra args via CAST_RUN_ARGS (e.g. "--debug --verbose").
  try {
    console.log('\n--- cast run trace ---');
    const extraArgs = (process.env.CAST_RUN_ARGS || '').trim().split(/\s+/).filter(Boolean);
    const result = spawnSync(
      'cast',
      ['run', receipt.transactionHash, '--rpc-url', ANVIL_RPC_URL, ...extraArgs],
      { stdio: 'inherit' }
    );
    if (result.status !== 0) {
      console.warn(`cast run failed (exit=${result.status ?? 'unknown'}).`);
    }
    console.log('--- end cast run trace ---\n');
  } catch (e) {
    console.warn('Skipping cast run trace (cast not available or failed to spawn).', e);
  }

  const tokenAAfter: ethers.BigNumber = await tokenA.balanceOf(traderWallet.address);
  const tokenBAfter: ethers.BigNumber = await tokenB.balanceOf(traderWallet.address);

  console.log('Balances after:');
  console.log('  tokenA:', ethers.utils.formatEther(tokenAAfter));
  console.log('  tokenB:', ethers.utils.formatEther(tokenBAfter));

  // Assertions similar to `SettlementTest.test_settle_basicSingleTrade`
  if (!tokenAAfter.eq(tokenABefore)) {
    throw new Error(`Expected tokenA to be fully refunded. before=${tokenABefore} after=${tokenAAfter}`);
  }
  if (!tokenBAfter.gt(tokenBBefore)) {
    throw new Error(`Expected tokenB to increase. before=${tokenBBefore} after=${tokenBAfter}`);
  }

  console.log('✅ E2E settle succeeded');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

