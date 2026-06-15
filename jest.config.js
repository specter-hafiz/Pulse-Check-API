'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  // Tests run with the volatile in-memory store (see config/index.js), so no
  // database file is created and each suite starts from a clean slate.
};
