/**
 * Constants for solver package.
 * Re-exports common flag constants and adds commission type label mapping.
 */

import {
  CommissionFlags,
  LABEL_OKX,
  LABEL_PARENT,
  LABEL_CHILD,
} from '@okx-intent-swap/sdk-common';

// Re-export for convenience
export { CommissionFlags, LABEL_OKX, LABEL_PARENT, LABEL_CHILD };

/**
 * Mapping from API commissionType string to on-chain label bit.
 */
export const COMMISSION_TYPE_LABEL_MAP: Record<string, bigint> = {
  okx: LABEL_OKX,
  parent: LABEL_PARENT,
  child: LABEL_CHILD,
};

/**
 * Solver fee direction flag bits (same bit positions as CommissionFlags).
 */
export const SolverFeeFlags = {
  /** Bit 255: Fee taken from fromToken */
  FROM_TOKEN: 1n << 255n,
  /** Bit 254: Fee taken from toToken */
  TO_TOKEN: 1n << 254n,
} as const;

/**
 * Mapping from API signingScheme string to numeric scheme value.
 */
export const SIGNING_SCHEME_MAP: Record<string, number> = {
  eip712: 0,
  ethSign: 1,
  eip1271: 2,
  preSign: 3,
};

/**
 * Zero address constant.
 */
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
