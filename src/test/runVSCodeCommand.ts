import * as path from "path";
import * as fs from "fs";
import * as os from "os"; // Import the os module

import { runTests } from "@vscode/test-electron";

async function main(argv: string[]) {
    try {
        await runCommand(argv);
    } catch (err) {
        console.error("Failed to launch VSCode Command", err);
        process.exit(1);
    }
}

async function runCommand(argv: string[]) {
    const commandToRun = argv[2];
    const commandArgs = argv[3] || "";

    let commandInputPath: string | undefined = undefined;

    try {
        if (commandToRun) {
            console.log("Target Command:", commandToRun);
            const commandInput = { command: commandToRun, args: commandArgs };
            
            // Generate a temporary filename
            const tempDir = os.tmpdir();
            const tempFilename = `commandInput_${Date.now()}.json`;
            commandInputPath = path.resolve(tempDir, tempFilename);

            // Write to the temporary file
            fs.writeFileSync(
                commandInputPath,
                JSON.stringify(commandInput, null, 2)
            );

            console.log(`Created temporary file at ${commandInputPath}`);
        }

        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to the test runner
        const extensionTestsPath = path.resolve(__dirname, "./commandRunner.ts");

        process.env.COMMAND_INPUT_PATH = commandInputPath;

        await runTests({
            extensionDevelopmentPath: extensionDevelopmentPath,
            extensionTestsPath: extensionTestsPath,
            launchArgs: ['--user-data-dir=/tmp/vscode_userdata']
        });
    } finally {
        if (commandInputPath) {
            fs.unlinkSync(commandInputPath);
            console.log(`Deleted temporary file at ${commandInputPath}`);
        }
    }
}

main(process.argv);
