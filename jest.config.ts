import type { Config } from 'jest';

const tsJestTransform = {
  '^.+\\.(t|j)s$': [
    'ts-jest',
    {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        resolvePackageJsonExports: false,
      },
    },
  ],
};

const config: Config = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  transform: tsJestTransform,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/app.module.ts',
    '!src/database/migrations/**',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: tsJestTransform,
      moduleFileExtensions: ['js', 'json', 'ts'],
    },
    {
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: tsJestTransform,
      moduleFileExtensions: ['js', 'json', 'ts'],
      testTimeout: 15000,
      setupFiles: ['<rootDir>/test/integration/jest.env.ts'],
    },
    {
      displayName: 'e2e',
      rootDir: '.',
      testMatch: ['<rootDir>/test/e2e/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: tsJestTransform,
      moduleFileExtensions: ['js', 'json', 'ts'],
      testTimeout: 15000,
      setupFiles: ['<rootDir>/test/integration/jest.env.ts'],
    },
  ],
};

export default config;
