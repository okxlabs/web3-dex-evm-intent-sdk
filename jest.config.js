/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@okx-intent-swap/sdk-common$': '<rootDir>/packages/common/src',
    '^@okx-intent-swap/sdk-config$': '<rootDir>/packages/config/src',
    '^@okx-intent-swap/sdk-contracts$': '<rootDir>/packages/contracts/src',
    '^@okx-intent-swap/sdk-order-signing$': '<rootDir>/packages/order-signing/src',
    '^@okx-intent-swap/sdk-trading$': '<rootDir>/packages/trading/src',
    '^@okx-intent-swap/sdk-ethers-v5-adapter$': '<rootDir>/packages/providers/ethers-v5-adapter/src',
    '^@okx-intent-swap/sdk-solver$': '<rootDir>/packages/solver/src',
    '^@okx-intent-swap/sdk$': '<rootDir>/packages/sdk/src',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/__tests__/**',
    '!packages/*/src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
