module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Allow ts-jest to transform ESM packages (marked, docx ship as ESM).
  transformIgnorePatterns: [
    'node_modules/(?!(marked|docx)/)',
  ],
  // Mock isomorphic-dompurify: it loads jsdom (which has ESM-only deps) in Node.
  // Sanitization behavior is tested in the frontend unit tests, not here.
  moduleNameMapper: {
    '^isomorphic-dompurify$': '<rootDir>/__mocks__/isomorphic-dompurify.ts',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      lines: 44,
      branches: 38,
      functions: 32,
      statements: 43,
    },
  },
};
