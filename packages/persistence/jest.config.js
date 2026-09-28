/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  // Testcontainers has to pull/start real Postgres + Redis images; give it
  // room. Individual tests still set their own timeouts where useful.
  testTimeout: 120_000,
};
