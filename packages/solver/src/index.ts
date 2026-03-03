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
} from './types';

// Constants
export {
  COMMISSION_TYPE_LABEL_MAP,
  SolverFeeFlags,
  SIGNING_SCHEME_MAP,
  ADDRESS_ZERO,
} from './constants';

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
} from './converters';
export type { CustomPriceResult, OrderCustomPrice } from './converters';

// Calldata builder (core)
export type { BuildSettleCalldataOptions, BuildSettleCalldataResult } from './calldata-builder';
export { buildSettleCalldata } from './calldata-builder';
