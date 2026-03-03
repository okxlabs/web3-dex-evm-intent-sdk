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
    '^@okx-intent-swap/sdk-contracts$': '<rootDir>/packages/contracts/src',
    '^@okx-intent-swap/sdk-solver$': '<rootDir>/packages/solver/src',
    // Strip .js extension for ts-jest (NodeNext emits .js imports, but tests run on .ts source)
    '^(\\.{1,2}/.*)\\.js$': '$1',
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
