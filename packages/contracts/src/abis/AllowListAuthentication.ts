/**
 * AllowListAuthentication contract ABI
 * Generated from AllowListAuthentication.sol
 */

export const ALLOW_LIST_AUTHENTICATION_ABI = [
  // Initializer
  {
    type: 'function',
    name: 'initializeManager',
    inputs: [{ name: 'manager_', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // State variables
  {
    type: 'function',
    name: 'manager',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },

  // Solver management
  {
    type: 'function',
    name: 'addSolver',
    inputs: [{ name: 'solver', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeSolver',
    inputs: [{ name: 'solver', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isSolver',
    inputs: [{ name: 'prospectiveSolver', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setManager',
    inputs: [{ name: 'manager_', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // Events
  {
    type: 'event',
    name: 'SolverAdded',
    inputs: [{ name: 'solver', type: 'address', indexed: true, internalType: 'address' }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SolverRemoved',
    inputs: [{ name: 'solver', type: 'address', indexed: true, internalType: 'address' }],
    anonymous: false,
  },
] as const;

export type AllowListAuthenticationABI = typeof ALLOW_LIST_AUTHENTICATION_ABI;
