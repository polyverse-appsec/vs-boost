import * as path from 'path';
import * as fs from 'fs';

import { runTests } from '@vscode/test-electron';

async function main(argv : string[]) {

	try {
        const filename = argv[2]?.split(",");
        let targetTestInputPath : string | undefined = undefined;
        try
        {
            if (filename) {
                console.log('Target Test filename:', filename);
                const targetTestInput = { filename };
                targetTestInputPath = path.resolve(__dirname, '../test/resources', 'targetTestInput.json');
                fs.writeFileSync(targetTestInputPath, JSON.stringify(targetTestInput, null, 2));
                console.log(`Created ${targetTestInputPath}`);
            }

            // The folder containing the Extension Manifest package.json
            // Passed to `--extensionDevelopmentPath`
            const extensionDevelopmentPath = path.resolve(__dirname, '../../');

            // The path to test runner
            // Passed to --extensionTestsPath
            const extensionTestsPath = path.resolve(__dirname, './suite/index');

            // Download VS Code, unzip it and run the integration test
            await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: filename });

        } finally {
            if (targetTestInputPath) {
                fs.unlinkSync(targetTestInputPath);
                console.log(`Deleted ${targetTestInputPath}`);
            }
        }
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main(process.argv);
