# HOWTO: Polyverse Boost Development

Boost plugin for Visual Studio Code is built using TypeScript, JavaScript and Visual Studio Code extensions

## Development

## Build
Build of the Boost plugin is performed by running npm compile - a script defined in package.json

## Versioning
Versioning of the Boost plugin is stored in package.json

## Test

### Dependencies
Boost integration testing uses (generated from ChatGPT):

1. `@types/glob`: Provides type definitions for the `glob` package, which is used for pattern matching file paths.
2. `@types/mocha`: Provides type definitions for the `mocha` testing framework.
3. `@types/node`: Provides type definitions for the Node.js runtime environment.
4. `@types/vscode`: Provides type definitions for the VS Code extension API.
5. `@typescript-eslint/eslint-plugin`: Provides ESLint rules and plugins for TypeScript code.
6. `@typescript-eslint/parser`: Provides a parser for TypeScript code in ESLint.
7. `@vscode/test-electron`: Provides utilities for testing VS Code extensions using Electron.
8. `eslint`: Provides a linter for JavaScript and TypeScript code.
9. `glob`: Provides functionality for pattern matching file paths.
10. `mocha`: Provides a testing framework for JavaScript and TypeScript code.
11. `typescript`: Provides a TypeScript compiler and language service.
12. `vscode-extension-tester`: Provides utilities for testing VS Code extensions.


### Running integration Tests
Run tests by executing:
1. npm run pretest
2. npm run test

Note: Full integration tests will also download the latest stable Visual Studio Code - for consistency of test environment.

Integration Tests check if each command exists, and performs a simple command verification (i.e. verify command can be run successfully)