import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BoostProjectData, FileSummaryItem, boostNotebookFileToFileSummaryItem } from '../../BoostProjectData'; // Update the path
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('BoostProjectData', function() {
    this.timeout(5000);
    const sampleDataJson = JSON.stringify({
        summary: {
            projectName: 'Sample Project',
            summaryUrl: 'http://example.com',
            filesToAnalyze: 1,
            filesAnalyzed: 1,
            issues: []
        },
        sectionSummary: [],
        analysis: [],
        files: {}
    });

    // Get the temporary directory and define the path for sampleData.json
    const tempDirectory = os.tmpdir();
    const sampleDataFilePath = path.join(tempDirectory, 'sampleData.json');

    suiteSetup(function(done) {
        // Write the sample data to a file before tests
        fs.writeFileSync(sampleDataFilePath, sampleDataJson, 'utf-8');
        done();
    });

    suiteTeardown(function(done) {
        // Clean up the sample data file after tests
        fs.unlinkSync(sampleDataFilePath);
        done();
    });

    test('should create an instance from a JSON string', function(done) {
        const boostProjectData = new BoostProjectData();
        boostProjectData.create(sampleDataJson);

        assert.strictEqual(boostProjectData.summary.projectName, 'Sample Project');
        assert.strictEqual(boostProjectData.summary.filesToAnalyze, 1);
        done();
    });

    test('should load an instance from a file', function(done) {
        const boostProjectData = new BoostProjectData();
        boostProjectData.load(sampleDataFilePath);

        assert.strictEqual(boostProjectData.summary.projectName, 'Sample Project');
        assert.strictEqual(boostProjectData.summary.filesToAnalyze, 1);
        done();
    });

    test('should correctly process empty boost notebook file', function (done) {
        // Update the path to where your test file is located
        // get the current working directory
        const cwd = process.cwd();
        const file = path.resolve(__dirname, '../resources/security.php.boost-notebook');
        const fileUri = vscode.Uri.file(file);
        const fileSummaryItem: FileSummaryItem = boostNotebookFileToFileSummaryItem(fileUri);

        // Add assertions based on what you expect the output to be for an empty file
        assert.strictEqual(fileSummaryItem.total, 0);
        assert.strictEqual(fileSummaryItem.completed, 0);
        // ...other assertions...
        done();
    });

    test('should correctly process non-empty boost notebook file', function (done) {
        // Update the path to where your test file is located
        const file = path.resolve(__dirname, '../resources/high.js.boost-notebook');
        const fileUri = vscode.Uri.file(file);
        const fileSummaryItem: FileSummaryItem = boostNotebookFileToFileSummaryItem(fileUri);

        // Add assertions based on what you expect the output to be for a non-empty file
        assert.strictEqual(fileSummaryItem.total, 7);
        assert.strictEqual(fileSummaryItem.completed, 5);
        assert.strictEqual(fileSummaryItem.error, 2);
        // ...other assertions...
        done();
    });

    test('should load up details for security and compliance notebook file', function (done) {
        // Update the path to where your test file is located
        const file = path.resolve(__dirname, '../resources/instructions.php.boost-notebook');
        const fileUri = vscode.Uri.file(file);
        const fileSummaryItem: FileSummaryItem = boostNotebookFileToFileSummaryItem(fileUri);

        // Add assertions based on what you expect the output to be for a non-empty file
        assert.strictEqual(fileSummaryItem.total, 2);
        assert.strictEqual(fileSummaryItem.completed, 2);
        assert.strictEqual(fileSummaryItem.error, 0);
        //check that fileSummaryItem.sections.bugAnalysisList.details has one item in the array
        assert.strictEqual(fileSummaryItem.sections?.bugAnalysisList?.details?.length, 1);
        //check the same thing for complianceAnalysisList
        assert.strictEqual(fileSummaryItem.sections?.complianceList?.details?.length, 1);

        // ...other assertions...
        done();
    });
});

