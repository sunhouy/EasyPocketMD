module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  detectOpenHandles: true,
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
};
