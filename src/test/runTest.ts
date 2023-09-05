import * as path from "path";
import * as fs from "fs";

import { runTests } from "@vscode/test-electron";

import Mocha from "mocha";
import { promises as fsPromises } from "fs";

async function loadMochaConfig() {
    const mochaConfigPath = path.resolve(__dirname, "mocha.json");
    try {
        const rawConfig = await fsPromises.readFile(mochaConfigPath, 'utf8');
        return JSON.parse(rawConfig);
    } catch (err) {
        console.error("Could not read mocha.json", err);
        return {};
    }
}

async function runMochaTests() {
    // Create a Mocha instance
    console.log("Running Mocha tests");

    const mochaConfig = await loadMochaConfig();

    const mocha = new Mocha(mochaConfig);

        // filter to one test if specified
    if (mochaConfig.targetTestFile) {
        // Specify the single test file
        const specificTestFile = path.resolve(__dirname, mochaConfig.targetTestFile);
        if (!fs.existsSync(specificTestFile)) {
            throw new Error(`Could not find test file ${specificTestFile}`);
        }
        mocha.addFile(specificTestFile);
    
        if (mochaConfig.targetTestName) {
            mocha.grep(mochaConfig.targetTestName);
        }
    } else {
        // Add test files
        const testDir = path.resolve(__dirname, "./unit");
        fs.readdirSync(testDir)
            .filter((file) => file.endsWith(".test.js"))
            .forEach((file) => {
                mocha.addFile(path.join(testDir, file));
            });
    }

    // Run Mocha tests
    try {
        const failures: number = await new Promise((resolve) =>
            mocha.run(resolve)
        );
        if (failures > 0) {
            throw new Error(`${failures} tests failed.`);
        }
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

async function main(argv: string[]) {
    try {
        // Run Mocha tests
        await runMochaTests();

        const filenames = argv[2]?.split(",", 1);
        let filename: string | undefined = filenames ? filenames[0] : undefined;

        let targetTestInputPath: string | undefined = undefined;
        try {
            if (filename) {
                console.log("Target Test filename:", filename);
                const targetTestInput = { filename };
                targetTestInputPath = path.resolve(
                    __dirname,
                    "../test/resources",
                    "targetTestInput.json"
                );
                fs.writeFileSync(
                    targetTestInputPath,
                    JSON.stringify(targetTestInput, null, 2)
                );
                console.log(`Created ${targetTestInputPath}`);
            }

            // The folder containing the Extension Manifest package.json
            // Passed to `--extensionDevelopmentPath`
            const extensionDevelopmentPath = path.resolve(__dirname, "../../");

            // The path to test runner
            // Passed to --extensionTestsPath
            const extensionTestsPath = path.resolve(__dirname, "./suite/index");

            // Download VS Code, unzip it and run the integration test
            let args = [];
            if (filename) {
                args.push(filename);
            }
            await runTests({
                extensionDevelopmentPath: extensionDevelopmentPath,
                extensionTestsPath: extensionTestsPath,
                launchArgs: args,
            });
        } finally {
            if (targetTestInputPath) {
                fs.unlinkSync(targetTestInputPath);
                console.log(`Deleted ${targetTestInputPath}`);
            }
        }
    } catch (err) {
        console.error("Failed to run tests", err);
        process.exit(1);
    }
}

main(process.argv);
