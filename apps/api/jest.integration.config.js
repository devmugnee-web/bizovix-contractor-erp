/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: "test-integration/.*\\.integration-spec\\.ts$",
  setupFiles: ["<rootDir>/test-integration/setup-env.ts"],
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.integration.json" }],
  },
  moduleFileExtensions: ["js", "json", "ts"],
  maxWorkers: 1,
  testTimeout: 60000,
  forceExit: true,
};
