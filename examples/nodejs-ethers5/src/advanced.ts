/**
 * Advanced IntentSwap SDK Example
 *
 * This example demonstrates:
 * 1. Using OrderSigningUtils directly
 * 2. Working with different signing schemes
 * 3. Interacting with the Settlement contract
 */

import { ethers } from 'ethers';
import {
  TradingSdk,
  EthersV5Adapter,
  OrderSigningUtils,
  OrderKind,
  SigningScheme,
  SupportedChainId,
  SETTLEMENT_ABI,
  ORDER_TYPES,
  createDomain,
  orderToEIP712Message,
} from '@okx-intent-swap/sdk';

const RPC_URL = process.env.RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x' + '0'.repeat(64);

async function advancedExample() {
  console.log('IntentSwap SDK - Advanced Example\n');

  // Setup
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const adapter = new EthersV5Adapter({ provider, signer: wallet });

  // 1. Using OrderSigningUtils directly
  console.log('1. Using OrderSigningUtils directly...');

  const order = {
    fromTokenAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    toTokenAddress: '0x0625afb445c3b6b7b929342a04a22599fd5dbb59',
    receiver: wallet.address,
    fromTokenAmount: ethers.utils.parseEther('0.1').toBigInt(),
    toTokenAmount: ethers.utils.parseUnits('100', 6).toBigInt(),
    validTo: Math.floor(Date.now() / 1000) + 3600,
    appData: '0x' + '0'.repeat(64),
    swapMode: OrderKind.EXACT_IN,
    partiallyFillable: false,
    owner: wallet.address,
    commissionInfos: [],
  };

  // Get the EIP-712 domain
  const settlementAddress = '0x0000000000000000000000000000000000000000'; // Replace with actual
  const domain = OrderSigningUtils.getDomain(SupportedChainId.SEPOLIA, settlementAddress);
  console.log('   Domain:', domain);

  // Convert order to EIP-712 message format
  const message = OrderSigningUtils.orderToMessage(order);
  console.log('   Message:', JSON.stringify(message, null, 2).substring(0, 200) + '...');

  // 2. Working with different signing schemes
  console.log('\n2. Different signing schemes...');

  // EIP-712 (default)
  console.log('   - EIP-712: Standard typed data signing');

  // eth_sign (legacy)
  console.log('   - eth_sign: Legacy message signing');

  // EIP-1271 (smart contract signatures)
  console.log('   - EIP-1271: For smart contract wallets (Gnosis Safe, etc.)');

  // PreSign (on-chain pre-signature)
  console.log('   - PreSign: For gasless order submission');

  // 3. Creating a Settlement contract interface
  console.log('\n3. Settlement contract interface...');

  const settlementInterface = new ethers.utils.Interface(SETTLEMENT_ABI);

  // Example: Encode a setPreSignature call
  const orderUid = '0x' + '1'.repeat(112); // 56 bytes
  const setPreSigData = settlementInterface.encodeFunctionData('setPreSignature', [orderUid, true]);
  console.log(`   setPreSignature encoded: ${setPreSigData.substring(0, 42)}...`);

  // Example: Encode an invalidateOrder call
  const invalidateData = settlementInterface.encodeFunctionData('invalidateOrder', [orderUid]);
  console.log(`   invalidateOrder encoded: ${invalidateData.substring(0, 42)}...`);

  // 4. Reading contract state
  console.log('\n4. Reading contract state (simulated)...');

  // These would work with actual deployed contracts
  console.log('   - filledAmount(orderUid): Returns amount already filled');
  console.log('   - preSignature(orderUid): Returns pre-sign status');
  console.log('   - domainSeparator(): Returns EIP-712 domain separator');

  // 5. Preparing a trade for solver submission
  console.log('\n5. Preparing trade data...');

  const tradeData = {
    fromTokenAddressIndex: 0,
    toTokenAddressIndex: 1,
    owner: order.owner,
    receiver: wallet.address,
    fromTokenAmount: order.fromTokenAmount.toString(),
    toTokenAmount: order.toTokenAmount.toString(),
    validTo: order.validTo,
    appData: order.appData,
    flags: 0, // EXACT_IN + fill-or-kill + EIP712
    executedAmount: 0,
    commissionInfos: [],
    signature: '0x' + '0'.repeat(130), // Placeholder
    solverFeeInfo: {
      feePercent: 0,
      solverAddr: '0x0000000000000000000000000000000000000000',
      flag: 0,
    },
  };

  console.log('   Trade prepared for solver submission');
  console.log(`   - fromTokenAddressIndex: ${tradeData.fromTokenAddressIndex}`);
  console.log(`   - toTokenAddressIndex: ${tradeData.toTokenAddressIndex}`);
  console.log(`   - flags: ${tradeData.flags} (EXACT_IN, fill-or-kill, EIP712)`);

  console.log('\n✅ Advanced example completed!');
}

// Pre-sign workflow example
async function preSignWorkflow() {
  console.log('\n--- Pre-Sign Workflow Example ---\n');

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const adapter = new EthersV5Adapter({ provider, signer: wallet });

  const sdk = new TradingSdk(
    {
      chainId: SupportedChainId.SEPOLIA,
      appCode: 'presign-example',
    },
    adapter
  );

  // 1. Create an order
  const order = await sdk.buildOrder({
    swapMode: OrderKind.EXACT_IN,
    fromTokenAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    toTokenAddress: '0x0625afb445c3b6b7b929342a04a22599fd5dbb59',
    fromTokenAmount: BigInt('100000000000000000'), // 0.1 ETH
    toTokenAmount: BigInt('100000000'), // 100 USDC
  });

  console.log('1. Order created');

  // 2. Sign with PreSign scheme (just returns owner address as signature)
  const signedOrder = await sdk.signOrder(order, SigningScheme.PRE_SIGN);
  console.log('2. Order signed with PreSign scheme');
  console.log(`   UID: ${signedOrder.uid.substring(0, 42)}...`);

  // 3. In a real scenario, you would:
  // a) Call setPreSignature on the Settlement contract
  // b) The solver can then include this order in settlements

  console.log('3. Next steps:');
  console.log('   - Call sdk.setPreSignature(orderUid, true)');
  console.log('   - Submit order to solver/backend');
  console.log('   - Solver includes order in batch settlement');

  console.log('\n✅ Pre-sign workflow completed!');
}

// Run examples
advancedExample()
  .then(() => preSignWorkflow())
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
