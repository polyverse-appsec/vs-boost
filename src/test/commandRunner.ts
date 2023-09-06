import * as vscode from "vscode";
import * as fs from "fs";

// ...

suite('Extension Command Runner', () => {
    // ...

    test('Run specified command', async () => {
        const commandInputPath = process.env.COMMAND_INPUT_PATH; 
        if (!commandInputPath) {
            console.error("Command input path is not set in the environment variables.");
            throw new Error("Command input path is not set");
        }

        const data = fs.readFileSync(commandInputPath, 'utf-8');
        const { command, args } = JSON.parse(data);

        if (command) {
            try {
                await vscode.commands.executeCommand(command, args);
            } catch (error) {
                console.error(`Failed to execute command ${command}:`, error);
                throw error; // This will cause the test to fail
            }
        } else {
            console.error(`Command is not specified in ${commandInputPath}`);
            throw new Error("Command is not specified");
        }
    });
});
