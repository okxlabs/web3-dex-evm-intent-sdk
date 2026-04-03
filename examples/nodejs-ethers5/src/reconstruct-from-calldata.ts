/**
 * Example: Reconstruct SolveRequest, SolveResponse, and interactions from calldata.
 *
 * Given only the hex-encoded Settlement.settle() calldata, this example demonstrates
 * reverse-engineering the original API-level objects using reconstructFromCalldata().
 *
 * Cross-verification: the reconstructed request/response are re-encoded via
 * buildSettleCalldata() and compared against the original calldata.
 *
 * Usage:
 *   pnpm build && node dist/reconstruct-from-calldata.js
 */

import {
  buildSettleCalldata,
  reconstructFromCalldata,
} from '@okx-intent-swap/sdk-solver';

// ============ Sample Calldata ============

/**
 * Produced by buildSettleCalldata() with useComputedPrices=true:
 * - 1 order: WETH → USDC (exactIn, 0.002 WETH)
 * - 3 commissions: okx 0.3%, child 0.1%, parent 0.05% (all fromToken)
 * - No interactions
 */
const SAMPLE_CALLDATA =
  '0xf1c95699000000000000000000000000000000000000000000000000003c047134e0acc0' +
  '0000000000000000000000000000000000000000000000000000000000000100' +
  '0000000000000000000000000000000000000000000000000000000000000160' +
  '00000000000000000000000000000000000000000000000000000000000001c0' +
  '00000000000000000000000000000000000000000000000000000000000005a0' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000afe9d55a5a4e90bbbabba0327bf72196b5683596' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000002' +
  '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' +
  '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
  '0000000000000000000000000000000000000000000000000000000000000002' +
  '00000000000000000000000000000000000000000000000000000000003beeb5' +
  '000000000000000000000000000000000000000000000000000712cdcfbf7000' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000003474fbbc6e43dcb0398e2eacbe1032cced806742' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000071afd498d0000' +
  '00000000000000000000000000000000000000000000000000000000003b54f3' +
  '0000000000000000000000000000000000000000000000000000000069aa4a0f' +
  'b44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000071afd498d0000' +
  '00000000000000000000000000000000000000000000000000000000000001e0' +
  '0000000000000000000000000000000000000000000000000000000000000320' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000afe9d55a5a4e90bbbabba0327bf72196b5683596' +
  '8000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000003' +
  '00000000000000000000000000000000000000000000000000000000002dc6c0' +
  '0000000000000000000000006ea08ca8f313d860808ef7431fc72c6fbcf4a72d' +
  '8100000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000000f4240' +
  '0000000000000000000000002c825edb17c2c04983a481ebd2da2a39424c7cb7' +
  '8040000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000007a120' +
  '0000000000000000000000003474fbbc6e43dcb0398e2eacbe1032cced806742' +
  '8080000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000041' +
  'b77e58fe3adcd5adc8f143b0ea88c894f5e027e47eb5f1b71eab080ef8c29a4d' +
  '07ef908ebb9dbc3f9e3944a52d5fcde88584b34e9facf5794b0ea0be90ab6900' +
  '1c00000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '0000000000000000000000000000000000000000000000000000000000000080' +
  '00000000000000000000000000000000000000000000000000000000000000a0' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000';

// ============ Main ============

function main() {
  console.log('--- Reconstruct from Calldata Example ---\n');

  // Step 1: Reconstruct request, response, interactions from calldata
  const { settleId, request, response, interactions } = reconstructFromCalldata(SAMPLE_CALLDATA);

  // Print reconstructed request
  console.log('========== Reconstructed ==========');
  console.log('  settleId:', settleId.toString());
  console.log('  orders:', request.orders.length);
  request.orders.forEach((order, i) => {
    console.log(`\n  --- Order ${i} ---`);
    console.log('    fromTokenAddress:', order.fromTokenAddress);
    console.log('    toTokenAddress:  ', order.toTokenAddress);
    console.log('    owner:           ', order.owner);
    console.log('    receiver:        ', order.receiver);
    console.log('    fromTokenAmount: ', order.fromTokenAmount);
    console.log('    toTokenAmount:   ', order.toTokenAmount);
    console.log('    validTo:         ', order.validTo);
    console.log('    swapMode:        ', order.swapMode);
    console.log('    signingScheme:   ', order.signingScheme);
    console.log('    signature:       ', order.signature.slice(0, 20) + '...');
    console.log('    commissionInfos: ', order.commissionInfos.length);
    order.commissionInfos.forEach((ci, j) => {
      console.log(`      [${j}] ${ci.commissionType} ${ci.feePercent} (1e9) direction=${ci.feeDirection ? 'from' : 'to'} toB=${ci.toB}`);
    });
  });

  // Print reconstructed response
  console.log('\n========== Reconstructed SolveResponse ==========');
  const solution = response.solutions[0];
  solution.orders.forEach((order, i) => {
    console.log(`  --- Response Order ${i} ---`);
    console.log('    executedFromTokenAmount:', order.executedFromTokenAmount);
    console.log('    executedToTokenAmount:  ', order.executedToTokenAmount);
    console.log('    solverFeeInfo.feePercent:', order.solverFeeInfo.feePercent);
    console.log('    solverFeeInfo.solverAddress:', order.solverFeeInfo.solverAddress);
  });
  console.log('\n  surplusFeeInfo:');
  console.log('    feePercent:  ', solution.surplusFeeInfo.feePercent);
  console.log('    trimReceiver:', solution.surplusFeeInfo.trimReceiver);

  // Print interactions
  console.log('\n========== Interactions ==========');
  const phaseNames = ['pre-swap', 'swap', 'post-swap'] as const;
  interactions.forEach((phase, i) => {
    console.log(`  ${phaseNames[i]}: ${phase.length} interaction(s)`);
    phase.forEach((ix, j) => {
      console.log(`    [${j}] target=${ix.target}, value=${ix.value.toString()}, callData=${ix.callData}`);
    });
  });

  // Step 2: Cross-verification — re-encode and compare against original calldata
  console.log('\n========== Cross-Verification ==========');
  const reEncoded = buildSettleCalldata(request, response, settleId, {
    interactions,
    useComputedPrices: false, // Use the on-chain clearingPrices directly
  });

  const match = reEncoded.calldata === SAMPLE_CALLDATA;
  console.log('  reconstruct → re-encode → calldata match:', match ? '✅' : '❌');

  if (!match) {
    const len = Math.max(reEncoded.calldata.length, SAMPLE_CALLDATA.length);
    for (let i = 0; i < len; i++) {
      if (reEncoded.calldata[i] !== SAMPLE_CALLDATA[i]) {
        console.log(`  first diff at char ${i}:`);
        console.log(`    re-encoded: ${reEncoded.calldata.slice(i, i + 40)}`);
        console.log(`    original:   ${SAMPLE_CALLDATA.slice(i, i + 40)}`);
        break;
      }
    }
  }

  console.log('\n✅ Reconstruct from calldata example completed');
}

main();
