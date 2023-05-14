import * as path from 'path';
import * as fs from 'fs';
import * as assert from 'assert';
import { debug } from 'console';

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
            let args = [ ];
            if (filename && filename[0]) {
                args.push(filename[0]);
            }
            await runTests( { extensionDevelopmentPath : extensionDevelopmentPath, extensionTestsPath : extensionTestsPath,
                launchArgs: args });

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

export function getRandomTestSourceFile() : string {
    const testCodePath = path.resolve(__dirname, '../test/resources/');
    const unsupportedExtensions = ['.o', '.out', '.s', '.typescript', 'resources', '.c'];

    // Get all files in the folder
    const allFiles = fs.readdirSync(testCodePath);

    // Filter files based on extensions (exclude unsupported files)
    const filteredFiles = allFiles.filter(file => {
        const ext = path.extname(file);
        return ext !== "" && !unsupportedExtensions.includes(ext);
    });

    let randomFile: string;
    const targetTestInputPath = path.resolve(testCodePath, 'targetTestInput.json');
    console.log(`Looking for ${targetTestInputPath}`);
    if (fs.existsSync(targetTestInputPath)) {
        const targetTestInput = JSON.parse(fs.readFileSync(targetTestInputPath, 'utf-8'));
        randomFile = path.resolve(testCodePath, targetTestInput.filename[0]);
        console.log('Read targetTestInput.json, using file:', randomFile);
    } else {
        // Select a random file from the filtered files
        console.log('No targetTestInput.json, selecting random file from:', filteredFiles);
        const randomIndex = Math.floor(Math.random() * filteredFiles.length);
        randomFile = path.resolve(testCodePath,filteredFiles[randomIndex]);
    }
    
    debug("Source File: " + randomFile);
    return randomFile;
}

main(process.argv);
