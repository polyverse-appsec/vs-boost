import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
// import * as myExtension from '../../extension';

suite("Extension Test Suite", () => {
    vscode.window.showInformationMessage("Start all tests.");

    test("Test Enironment Sanity Test test", (done) => {
        // we're doing a simple assert just to make sure
        // the test environment is working
        assert.strictEqual(0, 0);
        done();
    });
});
