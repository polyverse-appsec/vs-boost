import path from 'path';
import glob from 'glob';
import fs from 'fs';
import Mocha, { test } from 'mocha';
import { shuffle } from 'lodash';

// specify tests to run
const testFilter = '**/boostdata.test.js';

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	// Check if targetTestInput.json exists and read it
	const targetTestInputPath = path.resolve(__dirname, '../resources', 'targetTestInput.json');
	let targetTestFilename: string = '';
	if (fs.existsSync(targetTestInputPath)) {
	    const targetTestInput = JSON.parse(fs.readFileSync(targetTestInputPath, 'utf8'));
	    targetTestFilename = targetTestInput.filename;
	}

	return new Promise((resolve, reject) => {
		glob(testFilter, { cwd: testsRoot }, (err, files) => {
			if (err) {
				return reject(err);
			}

			// Shuffle the files so we don't have any ordering effects in tests
			const shuffledFiles = shuffle(files);

			// Add files in randomized order to the test suite
			shuffledFiles.forEach((file: string) => {
				if (!targetTestFilename || file.includes(targetTestFilename)) {
					console.log('Adding Test file:', file);
					mocha.addFile(path.resolve(testsRoot, file));
				}
			});

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
			} catch (err) {
				console.error(err);
				reject(err);
			}
		});
	});
}
