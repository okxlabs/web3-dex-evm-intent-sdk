/**
 * Example: Decode Settlement.settle() calldata back into SDK types.
 *
 * Demonstrates decoding a hex-encoded calldata string produced by buildSettleCalldata()
 * and inspecting all decoded fields (settleId, tokens, clearingPrices, trades,
 * interactions, surplusFeeInfo).
 *
 * Usage:
 *   pnpm build && node dist/decode-calldata.js
 */

import { decodeSettleCalldata } from '@okx-intent-swap/sdk-solver';

// ============ Sample Calldata ============

/**
 * This calldata was produced by buildSettleCalldata() with:
 * - 1 order: WETH → USDC (exactIn, 0.002 WETH)
 * - 3 commissions: okx 0.3%, child 0.1%, parent 0.05% (all fromToken)
 * - useComputedPrices: true
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
  console.log('--- Decode Calldata Example ---\n');

  const result = decodeSettleCalldata(SAMPLE_CALLDATA);

  // settleId
  console.log('[settleId]');
  console.log('  value:', result.settleId.toString());

  // tokens
  console.log('\n[tokens]');
  result.tokens.forEach((token, i) => {
    console.log(`  [${i}] ${token}`);
  });

  // clearingPrices
  console.log('\n[clearingPrices]');
  result.clearingPrices.forEach((price, i) => {
    console.log(`  [${i}] ${price.toString()}`);
  });

  // trades
  console.log('\n[trades]');
  result.trades.forEach((trade, i) => {
    console.log(`  --- Trade ${i} ---`);
    console.log(`    fromTokenAddressIndex: ${trade.fromTokenAddressIndex} → ${result.tokens[trade.fromTokenAddressIndex]}`);
    console.log(`    toTokenAddressIndex:   ${trade.toTokenAddressIndex} → ${result.tokens[trade.toTokenAddressIndex]}`);
    console.log(`    owner:           ${trade.owner}`);
    console.log(`    receiver:        ${trade.receiver}`);
    console.log(`    fromTokenAmount: ${trade.fromTokenAmount.toString()}`);
    console.log(`    toTokenAmount:   ${trade.toTokenAmount.toString()}`);
    console.log(`    validTo:         ${trade.validTo}`);
    console.log(`    appData:         ${trade.appData}`);
    console.log(`    flags:           ${trade.flags.toString()} (0x${trade.flags.toString(16)})`);
    console.log(`    executedAmount:  ${trade.executedAmount.toString()}`);
    console.log(`    signature:       ${trade.signature.slice(0, 20)}...`);

    console.log(`    commissionInfos: (${trade.commissionInfos.length})`);
    trade.commissionInfos.forEach((ci, j) => {
      console.log(`      [${j}] feePercent=${ci.feePercent.toString()}, receiver=${ci.referrerWalletAddress}, flag=0x${ci.flag.toString(16)}`);
    });

    console.log(`    solverFeeInfo:`);
    console.log(`      feePercent: ${trade.solverFeeInfo.feePercent.toString()}`);
    console.log(`      solverAddr: ${trade.solverFeeInfo.solverAddr}`);
    console.log(`      flag:       0x${trade.solverFeeInfo.flag.toString(16)}`);
  });

  // interactions
  console.log('\n[interactions]');
  const phaseNames = ['pre-swap', 'swap', 'post-swap'] as const;
  result.interactions.forEach((phase, i) => {
    console.log(`  ${phaseNames[i]}: ${phase.length} interaction(s)`);
    phase.forEach((ix, j) => {
      console.log(`    [${j}] target=${ix.target}, value=${ix.value.toString()}, callData=${ix.callData.slice(0, 20)}...`);
    });
  });

  // surplusFeeInfo
  console.log('\n[surplusFeeInfo]');
  console.log(`  feePercent:   ${result.surplusFeeInfo.feePercent.toString()}`);
  console.log(`  trimReceiver: ${result.surplusFeeInfo.trimReceiver}`);
  console.log(`  flag:         ${result.surplusFeeInfo.flag.toString()}`);

  console.log('\n✅ Decode calldata example completed');
}

main();
