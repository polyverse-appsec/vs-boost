import path from "path";
import glob from "glob";
import fs from "fs";
import Mocha from "mocha";
import { shuffle } from "lodash";
import nock, { back as nockBack } from "nock";

const testFilter = "suite/*.test.js";

function prepareScope(scope: any): nock.Scope {
    scope.filteringRequestBody = (body: string): string => {
        if (typeof body !== 'string') {
            return body;
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(body);
            delete parsedBody.session;  // Remove session token
            return JSON.stringify(parsedBody);
        } catch (e) {
            return body;  // If body is not JSON or another error occurs, return original body
        }
    };
    return scope;
}

export function run(): Promise<void> {


    nockBack.fixtures = path.join(__dirname, "..", "src", "test", "resources", "fixtures");
    nockBack.setMode("record");
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
    });

    const testsRoot = path.resolve(__dirname, "..");

    const targetTestInputPath = path.resolve(
        __dirname,
        "../resources",
        "targetTestInput.json"
    );
    let targetTestFilename: string = "";
    if (fs.existsSync(targetTestInputPath)) {
        const targetTestInput = JSON.parse(
            fs.readFileSync(targetTestInputPath, "utf8")
        );
        targetTestFilename = targetTestInput.filename;
    }

    return new Promise((resolve, reject) => {
        glob(testFilter, { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            const shuffledFiles = shuffle(files);

            shuffledFiles.forEach((file: string) => {
                if (!targetTestFilename || file.includes(targetTestFilename)) {
                    console.log("Adding Test file:", file);
                    mocha.addFile(path.resolve(testsRoot, file));
                }
            });

            try {
                nockBack("recorded_tests.json", { before: prepareScope }, function(nockDone) {
                    // This callback wraps the mocha test run
                    mocha.run((failures) => {
                        nockDone();  // Finish the recording
                        if (failures > 0) {
                            reject(new Error(`${failures} tests failed.`));
                        } else {
                            resolve();
                        }
                    });
                });
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    });
}
