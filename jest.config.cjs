/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: '/app/node_modules/ts-jest/presets/default-esm/jest-preset.js',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
