import path from 'path';
import glob from 'glob';
import Mocha from 'mocha';
import { shuffle } from 'lodash';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

            // shuffle the files so we don't have any ordering effects in tests
            const shuffledFiles = shuffle(files);
            
            // add files in randomized order to test suite - so we catch any ordering
            //    effects in tests
            shuffledFiles.forEach((file: string) => mocha.addFile(path.resolve(testsRoot, file)));

            // Add files to the test suite
//			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
	});
}
