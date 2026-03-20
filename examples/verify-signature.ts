/**
 * 按合约要求完整计算 EIP-712 digest，然后 ecrecover 与 owner 对比。
 * 打印所有中间结果。
 */
import { ethers } from 'ethers';
import {
  ORDER_TYPE_HASH,
  COMMISSION_INFO_TYPE_HASH,
  ORDER_KIND_HASH,
  CommissionFlags,
  LABEL_OKX,
  LABEL_PARENT,
  LABEL_CHILD,
} from '@okx-intent-swap/sdk-common';

const { keccak256, defaultAbiCoder, toUtf8Bytes, hexConcat, recoverAddress } = ethers.utils;
const encode = defaultAbiCoder.encode.bind(defaultAbiCoder);

// ======== 输入数据 ========
const owner = '0xd83be9aba0c6a872056fa6871df59e4ed1485d62';
const signature = '0x79f1f8cbeb98dffe7b0f67da9cfd62d8d9523ff011408eab4891637cb57c5a516fa8f52a2d4ebbde0e1d1ce0c05d7851abfa449da0e26e46cfaa7a5dc560c0041b';
const settlementContract = '0x1a34e1e604d8a55405172c0717b17f7631d5f265';
const chainId = 1;

const fromTokenAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const toTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const fromTokenAmount = '1000000000000000';
const toTokenAmount = '2093157';
const validTo = 1774258453;
const appDataHash = '0xb44dd4943b8f671e3e555b6e0fb8a882fd4c81d2bf2fbe27bf2bc76794d6f1ce';

const expectedOrderUid = '0x094c4d35911cea667cfe3c58ca0d359ae52cd2668eaf13fbe966263cd35c5bb0d83be9aba0c6a872056fa6871df59e4ed1485d6269c10915';

// 从 orderUid 中提取期望的 digest
const expectedDigest = expectedOrderUid.slice(0, 66);
const expectedOwner = '0x' + expectedOrderUid.slice(66, 106);
const expectedValidTo = parseInt(expectedOrderUid.slice(106, 114), 16);

console.log('========================================');
console.log('Step 0: 从 orderUid 提取期望值');
console.log('========================================');
console.log('expectedDigest:', expectedDigest);
console.log('expectedOwner:', expectedOwner);
console.log('expectedValidTo:', expectedValidTo, `(0x${expectedValidTo.toString(16)})`);
console.log('owner match:', expectedOwner.toLowerCase() === owner.toLowerCase());
console.log('validTo match:', expectedValidTo === validTo);

// ======== Step 1: Domain Separator ========
console.log('\n========================================');
console.log('Step 1: EIP-712 Domain Separator');
console.log('========================================');

const EIP712_DOMAIN_TYPE_HASH = keccak256(
  toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
);
const nameHash = keccak256(toUtf8Bytes('OKX Intent Swap'));
const versionHash = keccak256(toUtf8Bytes('v1.0.0'));

console.log('EIP712_DOMAIN_TYPE_HASH:', EIP712_DOMAIN_TYPE_HASH);
console.log('nameHash:', nameHash);
console.log('versionHash:', versionHash);
console.log('chainId:', chainId);
console.log('verifyingContract:', settlementContract);

const domainSeparator = keccak256(
  encode(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
    [EIP712_DOMAIN_TYPE_HASH, nameHash, versionHash, chainId, settlementContract]
  )
);
console.log('domainSeparator:', domainSeparator);

// ======== Step 2: CommissionInfo Hashes ========
console.log('\n========================================');
console.log('Step 2: CommissionInfo 哈希');
console.log('========================================');

console.log('COMMISSION_INFO_TYPE_HASH:', COMMISSION_INFO_TYPE_HASH);

// 3 个 commission 配置
const commissions = [
  {
    label: 'okx',
    feePercent: 3000000n,
    referrer: '0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d',
    flag: CommissionFlags.FROM_TOKEN_COMMISSION | LABEL_OKX,
  },
  {
    label: 'child',
    feePercent: 1000000n,
    referrer: '0x2c825edb17c2c04983a481ebd2da2a39424c7cb7',
    flag: CommissionFlags.FROM_TOKEN_COMMISSION | LABEL_CHILD,
  },
  {
    label: 'parent',
    feePercent: 5000000n,
    referrer: '0x3474fbbc6e43dcb0398e2eacbe1032cced806742',
    flag: CommissionFlags.FROM_TOKEN_COMMISSION | LABEL_PARENT,
  },
];

const commissionHashes: string[] = [];
for (const c of commissions) {
  const hash = keccak256(
    encode(
      ['bytes32', 'uint256', 'address', 'uint256'],
      [COMMISSION_INFO_TYPE_HASH, c.feePercent, c.referrer, c.flag]
    )
  );
  console.log(`\n  [${c.label}]`);
  console.log(`    feePercent: ${c.feePercent}`);
  console.log(`    referrer:   ${c.referrer}`);
  console.log(`    flag:       0x${c.flag.toString(16)}`);
  console.log(`    structHash: ${hash}`);
  commissionHashes.push(hash);
}

const commissionArrayHash = keccak256(hexConcat(commissionHashes));
console.log('\ncommissionArrayHash:', commissionArrayHash);

// ======== Step 3: Order Struct Hash ========
// EIP-712 类型:
// "Order(address fromTokenAddress,address toTokenAddress,address owner,address receiver,
//        uint256 fromTokenAmount,uint256 toTokenAmount,uint32 validTo,bytes32 appData,
//        bytes32 swapMode,bool partiallyFillable,CommissionInfo[] commissionInfos)"
console.log('\n========================================');
console.log('Step 3: Order Struct Hash');
console.log('========================================');

console.log('ORDER_TYPE_HASH:', ORDER_TYPE_HASH);

const swapModeHash = (ORDER_KIND_HASH as any).exactIn
  ?? (ORDER_KIND_HASH as any)['EXACT_IN']
  ?? ORDER_KIND_HASH[0];
console.log('swapMode (exactIn) hash:', swapModeHash);

// 尝试两种 receiver 变体
const receiverVariants = [
  { label: 'receiver = address(0) (SDK convention)', value: ethers.constants.AddressZero },
  { label: 'receiver = owner (raw)', value: owner },
];

for (const rv of receiverVariants) {
  console.log(`\n--- ${rv.label} ---`);
  console.log('  fromTokenAddress:', fromTokenAddress);
  console.log('  toTokenAddress:  ', toTokenAddress);
  console.log('  owner:           ', owner);
  console.log('  receiver:        ', rv.value);
  console.log('  fromTokenAmount: ', fromTokenAmount);
  console.log('  toTokenAmount:   ', toTokenAmount);
  console.log('  validTo:         ', validTo, `(0x${validTo.toString(16)})`);
  console.log('  appData:         ', appDataHash);
  console.log('  swapMode:        ', swapModeHash);
  console.log('  partiallyFillable:', false);
  console.log('  commissionInfos: ', commissionArrayHash);

  const orderStructHash = keccak256(
    encode(
      ['bytes32', 'address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint32', 'bytes32', 'bytes32', 'bool', 'bytes32'],
      [
        ORDER_TYPE_HASH,
        fromTokenAddress,
        toTokenAddress,
        owner,
        rv.value,
        fromTokenAmount,
        toTokenAmount,
        validTo,
        appDataHash,
        swapModeHash,
        false,
        commissionArrayHash,
      ]
    )
  );
  console.log('  orderStructHash: ', orderStructHash);

  // ======== Step 4: Final EIP-712 Digest ========
  const digest = keccak256(
    hexConcat(['0x1901', domainSeparator, orderStructHash])
  );
  console.log('  digest:          ', digest);
  console.log('  expected digest: ', expectedDigest);
  console.log('  digest match:    ', digest.toLowerCase() === expectedDigest.toLowerCase());

  // ======== Step 5: Signature Recovery ========
  console.log('\n  --- ecrecover ---');
  console.log('  signature:', signature);

  // 拆解签名
  const sig = ethers.utils.splitSignature(signature);
  console.log('  r:', sig.r);
  console.log('  s:', sig.s);
  console.log('  v:', sig.v);

  try {
    const recovered = recoverAddress(digest, signature);
    console.log('  recovered signer:', recovered);
    console.log('  owner:           ', owner);
    console.log('  signer == owner: ', recovered.toLowerCase() === owner.toLowerCase());
  } catch (e: any) {
    console.log('  ecrecover FAILED:', e.message);
  }
}

// ======== Step 6: 尝试直接用 expectedDigest 做 ecrecover ========
console.log('\n========================================');
console.log('Step 6: 用 expectedDigest 做 ecrecover');
console.log('========================================');
console.log('expectedDigest:', expectedDigest);
try {
  const recovered = recoverAddress(expectedDigest, signature);
  console.log('recovered signer:', recovered);
  console.log('owner:           ', owner);
  console.log('signer == owner: ', recovered.toLowerCase() === owner.toLowerCase());
} catch (e: any) {
  console.log('ecrecover FAILED:', e.message);
}
