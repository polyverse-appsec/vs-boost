# HOWTO: Polyverse Boost Development

Boost plugin for Visual Studio Code is built using TypeScript, JavaScript and Visual Studio Code extensions

## Development

## Build
Build of the Boost plugin is performed by running npm compile - a script defined in package.json

## Versioning
Versioning of the Boost plugin is stored in package.json

## Test

### Dependencies
Boost integration testing uses:
1. npm for running tests
2. mocha for test harness
3. chai for test helpers
4. vscode-extension-tester for helpers to use VSCode
5. chromedriver for easier manipulation of VSCode web DOM

### Running integration Tests
Run tests by executing:
1. npm run pretest
2. npm run test

Note: Full integration tests will also download the latest stable Visual Studio Code - for consistency of test environment.