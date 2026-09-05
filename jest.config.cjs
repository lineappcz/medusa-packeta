module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "commonjs" },
      },
    ],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/index.ts"],
  coverageThreshold: {
    global: { statements: 90, branches: 75, functions: 90, lines: 90 },
  },
  coverageReporters: ["text", "json-summary", "lcov"],
}
