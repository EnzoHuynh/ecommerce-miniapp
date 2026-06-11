/** Unit tests (*.spec.ts under src/). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    // Resolve the workspace package to its source so tests need no prebuild.
    '^@app/shared$': '<rootDir>/../../packages/shared/src',
  },
};
