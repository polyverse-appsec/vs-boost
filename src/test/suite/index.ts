import path from 'path';
import glob from 'glob';
import Mocha, { test } from 'mocha';
import { shuffle } from 'lodash';

// specify tests to run
const testFilter = '**/**.test.js';
// const testFilter = "**/rightClick_ProcessFile_command.test.js";

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((resolve, reject) => {
		glob(testFilter, { cwd: testsRoot }, (err, files) => {
            files.forEach((file: string) => {
                console.log('Test file:', file);
            });
			if (err) {
				return reject(err);
			}

			// Shuffle the files so we don't have any ordering effects in tests
			const shuffledFiles = shuffle(files);

			// Add files in randomized order to the test suite
			shuffledFiles.forEach((file: string) => {
                mocha.addFile(path.resolve(testsRoot, file));
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
