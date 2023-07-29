# HOWTO: Polyverse Boost Development

Boost plugin for Visual Studio Code is built using TypeScript, JavaScript and Visual Studio Code extensions

## Quick Start
### Commands
`npm run` command is used for most build and test
 * `clean` Deletes all output build and test data and source and binaries

 * `build-instructions` Builds the src/instructions.json file using raw markdown

 * `compile` Compiles the product source
 * `watch` Enables Visual Studio to build in background continuously

 * `lint` Runs lint across product source

 * `copy:test-data` Copies all test source and data to the output test run folder
 * `pretest` Preps the product code to be built and linted and tested

* `esbuild-base` Builds the product with collapsed files (smaller size)
* `esbuild` Builds the product with source mapping for debugging
* `esbuild-watch` Enables Visual Studio to build in background

* `esbuild-pretest` Preps the product code to be built and linted and tested with smaller size

* `prepublish:build` Runs minify to shrink the product code to the
smallest - before publishing to marketplace

* `prepublish:pretest` Preps the product code to be built in micro/min size and tested

* `test` Runs all automated integration tests once

* `package` Builds a VSIX package for local or internal sharing and testing

### So you want to be productive quickly

To do easy and quick build and test
1. `npm run pretest`
2. `npm run test` or `./test_loop.sh` to run tests many times in loop randomly

To do compacted build and test (e.g. optimized file size)
1. `npm run esbuild-pretest`
2. `npm run test` or `./test_loop.sh` to run tests many times in loop randomly

To do packaging and test and publishing
1. `npm run prepublish:pretest`
2. `npm run test` or `./test_loop.sh` to run tests many times in loop randomly

To publish internally and testing
1. `npm run package`
2. Manual install and test of VSIX package

## Source/Project structure

* `package.json` - defines the referenced libraries, build/test commands, plugin description,
versioning, icon and key Visual Studio Code extensions (Commands)
* `src/extension.ts` - this is the main file where Boost commands are implemented
  * The file exports two functions, `activate`, which is called the very first time your extension is activated (in this case by executing the command). Inside the `activate` function we call `registerCommand` for all commands. We also export 'deactivate' for
  cleanup tasks on shutdown (though none occur today)
* `src/*_controller.ts` TypeScript code that implements the controllers that perform
   each command, and make calls to the Boost Service API then update the Notebook cells.
  `instructions.json` is the user instructions shown on install/activation.
  `split.ts` is TypeScript code used to parse / split source files into functions before
   processing in the cloud-based service API
* `.vscode/launch.json` commands that VSC shows to you for debugging live or running tests
* `.vscode/tasks.json` commands that tell VSC to build in foreground and background when source changes
* `tsconfig.json` config for the TypeScript compiler when building the product code
Note that TypeScript is compiled into JavaScript for deployment into VSC
* `README.md` markdown that is shown in the Marketplace to explain the Boost plugin

* `src/test/*` all the test code - see below


## Development

## Build
Build of the Boost plugin is performed by running npm compile - a script defined in package.json
The goal is to automate our builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).

We improve startup time and reduce file size by [bundling our extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
Specifically we use esbuild - which can partially obfuscate our code by removing whitespace
and creating coded variable and function names to reduce size.
For now - this is only used when publishing to marketplace.
It also means we'll likely want to add the telemetry/error reporting logic to the product
to improve supportability.

## Versioning
Versioning of the Boost plugin is stored in package.json
We generally increment the build (0.0.x) on changes to the product.
Eventually we'll likely use automated build versioning in CI/CD
For now - the minor rev is only done when publishing.

## UX Guidelines for Extensions
* [Follow UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) to create extensions that seamlessly integrate with VS Code's native interface and patterns.

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

NOTE: before running tests, you'll need to be authenticated with github on the command line with
```
gh auth login -s user:email
```

Run tests by executing:
1. npm run pretest
2. npm run test

Or to run integration Tests with Package/Min
1. npm run esbuild-pretest
2. npm run test

Note: In both cases, *pretest will clean/erase the output folder and rebuild everything

Note: Full integration tests will also download the latest stable Visual Studio Code - for consistency of test environment.

Integration Tests check if each command exists, and performs a simple command verification (i.e. verify command can be run successfully)

### Debugging Boost Service API (locally)
If you want to debug the Boost Service API locally, go into the User settings (JSON) in the Visual Studio Code UI/settings
and add the following line:
```
    "polyverse-boost-notebook.cloudServiceStage": "local"
```
Or you can set the value to "dev" or "prod" or anything else for non-local.
This takes effect immediately at runtime for all future calls - affecting ALL calls.

Possible target service stages are:
* local - runs the Boost Service API locally on your machine
* dev - runs the Boost Service API in the dev environment - for individual dev features
* test - runs the Boost Service API in the test environment - for wider testing across devs/features
* staging - runs the Boost Service API in the staging environment - for full pre-deployment validation testing
* prod - runs the Boost Service API in the prod environment - production service, default for customers

Local service will use localhost port/IP address for the Boost Service API.
This is useful if you are making changes to the Boost Service API and want to test the Client side local.
Use the Boost lambda server.py shim for local service debugging

### Fault Injection for Boost Service API
Add this setting to the User Settings (JSON) in the Visual Studio Code UI/settings to inject faults into the Boost Service callouts
```
    "polyverse-boost-notebook.serviceFaultInjection": "100"
```
This will set a % of service faults to randomly inject. For example, 100 will result in 100% service faults, 50 will result in 50% service faults, etc.
0 results in no faults injected, and normal behavior.
Service faults are useful for testing error handling code when making call outs to Boost Service API from the Extension code

### Debugging live tests
* Open the debug viewlet (`Ctrl+Shift+D` or `Cmd+Shift+D` on Mac) and from the launch configuration dropdown pick `Extension Tests`.
* Press `F5` to run the tests in a new window with your extension loaded.
* Run your command from the command palette by pressing (Ctrl+Shift+P or Cmd+Shift+P on Mac)
* Commands are listed under Boost
* Set breakpoints in your code to debug your extension.
* Find output from your extension in the debug console.

* See the output of the test result in the debug console.
* Make changes to `src/test/suite/extension.test.ts` or create new test files inside the `test/suite` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.

* To run a specific test from the command line, do the following command `npm run test -- src/test/suite/boostdata.test.ts`

### Packaging for Local or Internal Sharing
To create a single package file of the Boost code to share or test - without using the Marketplace publishing - use the vsce package command.
vsce is the Packaging and Publishing command - e.g. Visual Studio Code Extension (VSCE)
To install it: `npm install -g @vscode/vsce`

### Publishing to Marketplace
* We [publish Boost extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code extension marketplace manually - synchronized with
critical fixes, major new features or a joint marketing/customer milestone.
Use following extra steps to publish:
1. npm run prepublish:pretest
2. npm run prepublish:test
3. npm run prepublish:login
4. npm run publish

NOTE: If you have NOT published before, you'll need a personal access key to marketplace - see above VSC publishing link for details.

Example of Output from Publishing:

2. Login Example
npm run prepublish:login
```https://marketplace.visualstudio.com/manage/publishers/
Personal Access Token for publisher 'polyversecorporation': ****************************************************

The Personal Access Token verification succeeded for the publisher 'polyversecorporation'.
```

3. Publish Example
npm run publish
```
⚡ Done in 94ms
 INFO  Publishing 'polyversecorporation.polyverse-boost-notebook v0.9.5'...
 INFO  Extension URL (might take a few minutes): https://marketplace.visualstudio.com/items?itemName=polyversecorporation.polyverse-boost-notebook
 INFO  Hub URL: https://marketplace.visualstudio.com/manage/publishers/polyversecorporation/extensions/polyverse-boost-notebook/hub
 DONE  Published polyversecorporation.polyverse-boost-notebook v0.9.5.
```


###TEMPORARY###
disabled the following panels for now until we have a better way to handle them
```
                {
                    "type": "webview",
                    "id": "polyverse-boost-doc-view",
                    "name": "Documentation",
                    "icon": "resources/boost_icon_plain.svg"
                },
                {
                    "type": "webview",
                    "id": "polyverse-boost-security-view",
                    "name": "Security Scan",
                    "icon": "resources/boost_icon_plain.svg"
                },
```