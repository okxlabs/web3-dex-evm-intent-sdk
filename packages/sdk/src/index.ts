/**
 * @okx-intent-swap/sdk
 * Complete IntentSwap SDK - re-exports all packages for convenience
 */

// ============ Common Types and Utilities ============
export type {
  Order,
  OrderForSigning,
  CommissionInfo,
  CommissionInfoForSigning,
  SolverFeeInfo,
  Trade,
  SignedOrder,
  OrderParameters,
  Interaction,
  Transfer,
  SurplusFeeInfo,
  TypedDataDomain,
  TypedDataField,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Log,
  Adapter,
} from '@okx-intent-swap/sdk-common';

export {
  OrderKind,
  SigningScheme,
  CommissionFlags,
  ORDER_KIND_HASH,
  COMMISSION_DENOM,
  COMMISSION_MAX_TOTAL_PERCENT,
  SURPLUS_MAX_FEE_PERCENT,
  MAX_COMMISSION_ENTRIES,
  BUY_ETH_ADDRESS,
  RECEIVER_SAME_AS_OWNER,
  ORDER_UID_LENGTH,
  ECDSA_SIGNATURE_LENGTH,
  EIP712_DOMAIN,
  ORDER_TYPE_HASH,
  COMMISSION_INFO_TYPE_HASH,
  BalanceMode,
  DEFAULT_ORDER_VALIDITY,
  ZERO_BYTES32,
  LABEL_OKX,
  LABEL_PARENT,
  LABEL_CHILD,
  hexToBytes,
  bytesToHex,
  packOrderUid,
  extractOrderUidParams,
  getActualReceiver,
  orderToSigningFormat,
  commissionInfoToSigningFormat,
  isValidAddress,
  isValidBytes32,
  encodeTradeFlags,
  decodeTradeFlags,
  validateCommissionInfo,
  validateOrder,
  normalizeAddress,
  isOrderExpired,
  getCurrentTimestamp,
  setGlobalAdapter,
  getGlobalAdapter,
  clearGlobalAdapter,
} from '@okx-intent-swap/sdk-common';

// ============ Configuration ============
export type { ChainConfig, ContractAddresses, EIP712Domain, OrderTypedData } from '@okx-intent-swap/sdk-config';

export {
  SupportedChainId,
  CHAIN_CONFIGS,
  getChainConfig,
  isSupportedChain,
  getSupportedChainIds,
  getMainnetChainIds,
  getTestnetChainIds,
  CONTRACT_ADDRESSES,
  getContractAddresses,
  getSettlementAddress,
  getTokenApproveProxyAddress,
  areContractsDeployed,
  getDeployedChains,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_ORDER_TYPES,
  EIP712_PRIMARY_TYPE,
  getEIP712Domain,
} from '@okx-intent-swap/sdk-config';

// ============ Contracts ============
export type { SettlementABI, AllowListAuthenticationABI, ERC20ABI } from '@okx-intent-swap/sdk-contracts';

export { SETTLEMENT_ABI, ALLOW_LIST_AUTHENTICATION_ABI, ERC20_ABI } from '@okx-intent-swap/sdk-contracts';

// ============ Order Signing ============
export type { SignOrderOptions, SigningResult } from '@okx-intent-swap/sdk-order-signing';

export {
  OrderSigningUtils,
  ORDER_TYPES,
  createDomain,
  orderToEIP712Message,
  commissionInfoToMessage,
  signOrderEIP712,
  signOrderEthSign,
  TYPE_HASHES,
  computeDomainSeparator,
  hashCommissionInfo,
  hashCommissionInfos,
  hashOrderStruct,
  computeOrderDigest,
} from '@okx-intent-swap/sdk-order-signing';

// ============ Trading SDK ============
export type { TradingSdkOptions, TraderParams } from '@okx-intent-swap/sdk-trading';

export { TradingSdk } from '@okx-intent-swap/sdk-trading';

// ============ Solver SDK ============
export type {
  SolveRequest,
  SolveResponse,
  SolveRequestOrder,
  SolveResponseOrder,
  ApiCommissionInfo,
  ApiSolverFeeInfo,
  ApiSurplusFeeInfo,
  ClearingPrices,
  Solution,
  BuildSettleCalldataOptions,
  BuildSettleCalldataResult,
  CustomPriceResult,
  OrderCustomPrice,
} from '@okx-intent-swap/sdk-solver';

export {
  buildSettleCalldata,
  packCommissionFlag,
  convertApiCommissionInfo,
  convertApiSolverFeeInfo,
  convertApiSurplusFeeInfo,
  convertClearingPrices,
  buildTradeFromSolveOrders,
  collectTokenAddresses,
  buildTokenIndexMap,
  computeCustomPrices,
  buildClearingPricesFromCustomPrices,
  COMMISSION_TYPE_LABEL_MAP,
  SolverFeeFlags,
  SIGNING_SCHEME_MAP,
} from '@okx-intent-swap/sdk-solver';

// ============ Ethers v5 Adapter ============
export type { EthersV5AdapterOptions } from '@okx-intent-swap/sdk-ethers-v5-adapter';

export { EthersV5Adapter } from '@okx-intent-swap/sdk-ethers-v5-adapter';
