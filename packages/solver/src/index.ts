/**
 * @okx-intent-swap/sdk-solver
 * Assembles Settlement.settle() calldata from Solver API /solve responses.
 */

// Types (API wire format)
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
  SettleInfo,
  SettleRequest,
} from './types.js';

// Constants
export {
  COMMISSION_TYPE_LABEL_MAP,
  SolverFeeFlags,
  SIGNING_SCHEME_MAP,
  ADDRESS_ZERO,
} from './constants.js';

// Converters
export {
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
} from './converters.js';
export type { CustomPriceResult, OrderCustomPrice } from './converters.js';

// Calldata builder (core)
export type { BuildSettleCalldataOptions, BuildSettleCalldataResult, DecodeSettleCalldataResult } from './calldata-builder.js';
export { buildSettleCalldata, decodeSettleCalldata } from './calldata-builder.js';

// Calldata decoder (reverse: calldata → request/response)
export type { ReconstructFromCalldataResult } from './calldata-decoder.js';
export { reconstructFromCalldata, unpackCommissionFlag, unpackSolverFeeFlag } from './calldata-decoder.js';
