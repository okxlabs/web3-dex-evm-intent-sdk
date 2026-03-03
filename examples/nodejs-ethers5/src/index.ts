/**
 * IntentSwap SDK Example - Node.js with ethers v5
 *
 * This example demonstrates how to:
 * 1. Set up the SDK with ethers v5
 * 2. Create and sign an order
 * 3. Use pre-signatures
 * 4. Check order status
 */

import { ethers } from 'ethers';
import {
  TradingSdk,
  EthersV5Adapter,
  OrderKind,
  SupportedChainId,
  packOrderUid,
  extractOrderUidParams,
} from '@okx-intent-swap/sdk';

// Configuration - replace with your values
const RPC_URL = process.env.RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x' + '0'.repeat(64); // Replace with actual key

// Example token addresses (Sepolia testnet)
const WETH_ADDRESS = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
const USDC_ADDRESS = '0x0625afb445c3b6b7b929342a04a22599fd5dbb59';

async function main() {
  console.log('IntentSwap SDK Example - Node.js with ethers v5\n');

  // 1. Set up provider and wallet
  console.log('1. Setting up provider and wallet...');
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`   Wallet address: ${wallet.address}`);

  // 2. Create the adapter
  console.log('\n2. Creating EthersV5Adapter...');
  const adapter = new EthersV5Adapter({
    provider,
    signer: wallet,
  });

  // 3. Initialize the TradingSdk
  console.log('\n3. Initializing TradingSdk...');
  const sdk = new TradingSdk(
    {
      chainId: SupportedChainId.SEPOLIA,
      appCode: 'intentswap-example',
      // Optional: provide custom contract addresses if deployed
      // settlementAddress: '0x...',
      // tokenApproveProxyAddress: '0x...',
    },
    adapter
  );
  console.log(`   Chain ID: ${sdk.getChainId()}`);

  // 4. Build an order
  console.log('\n4. Building an order...');
  const order = await sdk.buildOrder({
    swapMode: OrderKind.EXACT_IN,
    fromTokenAddress: WETH_ADDRESS,
    toTokenAddress: USDC_ADDRESS,
    fromTokenAmount: ethers.utils.parseEther('0.1').toBigInt(), // 0.1 WETH
    toTokenAmount: ethers.utils.parseUnits('100', 6).toBigInt(), // 100 USDC minimum
    // receiver: wallet.address, // Optional, defaults to signer
    // validTo: Math.floor(Date.now() / 1000) + 3600, // Optional, defaults to 30 min
    // partiallyFillable: false, // Optional, defaults to false
    commissionInfos: [], // No commission fees in this example
  });

  console.log('   Order created:');
  console.log(`   - From: ${order.fromTokenAddress}`);
  console.log(`   - To: ${order.toTokenAddress}`);
  console.log(`   - From Amount: ${order.fromTokenAmount.toString()}`);
  console.log(`   - To Amount: ${order.toTokenAmount.toString()}`);
  console.log(`   - Valid To: ${new Date(order.validTo * 1000).toISOString()}`);

  // 5. Sign the order
  console.log('\n5. Signing the order...');
  try {
    const signedOrder = await sdk.signOrder(order);
    console.log('   Order signed successfully!');
    console.log(`   - Order UID: ${signedOrder.uid}`);
    console.log(`   - Signature: ${signedOrder.signature.substring(0, 42)}...`);
    console.log(`   - Signing Scheme: ${signedOrder.signingScheme}`);
  } catch (error) {
    console.log('   Note: Signing requires a valid signer (demo skipped)');
  }

  // 6. Demonstrate order UID utilities
  console.log('\n6. Order UID utilities demo...');
  const demoDigest = '0x' + '1'.repeat(64);
  const demoOwner = wallet.address;
  const demoValidTo = Math.floor(Date.now() / 1000) + 3600;

  const uid = packOrderUid(demoDigest, demoOwner, demoValidTo);
  console.log(`   Packed UID: ${uid.substring(0, 42)}...`);

  const extracted = extractOrderUidParams(uid);
  console.log(`   Extracted digest: ${extracted.orderDigest.substring(0, 42)}...`);
  console.log(`   Extracted owner: ${extracted.owner}`);
  console.log(`   Extracted validTo: ${new Date(extracted.validTo * 1000).toISOString()}`);

  // 7. Show how to use with commission fees
  console.log('\n7. Example with commission fees...');
  const orderWithFees = await sdk.buildOrder({
    swapMode: OrderKind.EXACT_IN,
    fromTokenAddress: WETH_ADDRESS,
    toTokenAddress: USDC_ADDRESS,
    fromTokenAmount: ethers.utils.parseEther('1').toBigInt(),
    toTokenAmount: ethers.utils.parseUnits('1000', 6).toBigInt(),
    commissionInfos: [
      {
        feePercent: 10_000_000n, // 1% fee (in 1e9 precision)
        referrerWalletAddress: '0x0000000000000000000000000000000000000001', // Fee recipient
        flag: 1n << 255n, // FROM_TOKEN_COMMISSION flag
      },
    ],
  });
  console.log('   Order with 1% commission fee created');
  console.log(`   - Commission recipient: ${orderWithFees.commissionInfos[0].referrerWalletAddress}`);
  console.log(`   - Commission rate: ${Number(orderWithFees.commissionInfos[0].feePercent) / 1e7}%`);

  console.log('\n✅ Example completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Deploy the Settlement contract');
  console.log('2. Update contract addresses in sdk-config');
  console.log('3. Approve tokens on TokenApproveProxy');
  console.log('4. Submit signed orders to your backend/solver');
}

// Run the example
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
