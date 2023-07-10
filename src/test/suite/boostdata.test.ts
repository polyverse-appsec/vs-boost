import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    BoostProjectData,
    boostNotebookFileToFileSummaryItem,
} from "../../BoostProjectData"; // Update the path
import { FileSummaryItem } from "../../boostprojectdata_interface";

import * as assert from "assert";
import * as vscode from "vscode";

suite("BoostProjectData", function () {
    this.timeout(5000);
    const sampleDataJson = JSON.stringify({
        summary: {
            projectName: "Sample Project",
            summaryUrl: "http://example.com",
            filesToAnalyze: 1,
            filesAnalyzed: 1,
            issues: [],
        },
        sectionSummary: [],
        analysis: [],
        files: {},
    });

    // Get the temporary directory and define the path for sampleData.json
    const tempDirectory = os.tmpdir();
    const sampleDataFilePath = path.join(tempDirectory, "sampleData.json");

    suiteSetup(function (done) {
        // Write the sample data to a file before tests
        fs.writeFileSync(sampleDataFilePath, sampleDataJson, "utf-8");
        done();
    });

    suiteTeardown(function (done) {
        // Clean up the sample data file after tests
        fs.unlinkSync(sampleDataFilePath);
        done();
    });

    test("should create an instance from a JSON string", function (done) {
        const boostProjectData = new BoostProjectData();
        boostProjectData.create(sampleDataJson);

        assert.strictEqual(
            boostProjectData.summary.projectName,
            "Sample Project"
        );
        assert.strictEqual(boostProjectData.summary.filesToAnalyze, 1);
        done();
    });

    test("should load an instance from a file", function (done) {
        const boostProjectData = new BoostProjectData();
        boostProjectData.load(sampleDataFilePath);

        assert.strictEqual(
            boostProjectData.summary.projectName,
            "Sample Project"
        );
        assert.strictEqual(boostProjectData.summary.filesToAnalyze, 1);
        done();
    });

    test("should correctly process empty boost notebook file", function (done) {
        // Update the path to where your test file is located
        // get the current working directory
        const cwd = process.cwd();
        const file = path.resolve(
            __dirname,
            "../resources/security.php.boost-notebook"
        );
        const fileUri = vscode.Uri.file(file);
        const fileSummaryItem: FileSummaryItem =
            boostNotebookFileToFileSummaryItem(fileUri);

        // Add assertions based on what you expect the output to be for an empty file
        assert.strictEqual(fileSummaryItem.totalCells, 0);
        assert.strictEqual(fileSummaryItem.completedCells, 0);
        // ...other assertions...
        done();
    });

    test("should correctly process non-empty boost notebook file", function (done) {
        // Update the path to where your test file is located
        const file = path.resolve(
            __dirname,
            "../resources/high.js.boost-notebook"
        );
        const fileUri = vscode.Uri.file(file);
        const fileSummaryItem: FileSummaryItem =
            boostNotebookFileToFileSummaryItem(fileUri);

        // Add assertions based on what you expect the output to be for a non-empty file
        assert.strictEqual(fileSummaryItem.totalCells, 7);
        assert.strictEqual(fileSummaryItem.completedCells, 5);
        assert.strictEqual(fileSummaryItem.errorCells, 2);
        // ...other assertions...
        done();
    });

    test("should load up details for security and compliance notebook file", function (done) {
        // Update the path to where your test file is located
        const file = path.resolve(
            __dirname,
            "../resources/instructions.php.boost-notebook"
        );
        const fileUri = vscode.Uri.file(file);
        const fileSummaryItem: FileSummaryItem =
            boostNotebookFileToFileSummaryItem(fileUri);

        // Add assertions based on what you expect the output to be for a non-empty file
        assert.strictEqual(fileSummaryItem.totalCells, 2);
        assert.strictEqual(fileSummaryItem.completedCells, 2);
        assert.strictEqual(fileSummaryItem.errorCells, 0);
        //check that fileSummaryItem.sections.bugAnalysisList.details has one item in the array
        assert.strictEqual(
            fileSummaryItem.sections?.bugAnalysisList?.details?.length,
            1
        );
        //check the same thing for complianceAnalysisList
        assert.strictEqual(
            fileSummaryItem.sections?.complianceList?.details?.length,
            1
        );

        // ...other assertions...
        done();
    });

    //now test addFileSummaryToSectionSummaries
    test("should add file summary to section summaries", function (done) {
        let boostprojectdata = new BoostProjectData();
        let file = path.resolve(
            __dirname,
            "../resources/instructions.php.boost-notebook"
        );
        let fileUri = vscode.Uri.file(file);
        let fileSummaryItem: FileSummaryItem =
            boostNotebookFileToFileSummaryItem(fileUri);
        boostprojectdata.updateWithFileSummary(fileSummaryItem, file);

        //now grab a second file and add it to the same boostprojectdata
        file = path.resolve(__dirname, "../resources/high.js.boost-notebook");
        fileUri = vscode.Uri.file(file);
        fileSummaryItem = boostNotebookFileToFileSummaryItem(fileUri);
        boostprojectdata.updateWithFileSummary(fileSummaryItem, file);

        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.filesAnalyzed,
            2
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.status,
            "incomplete"
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.completedCells,
            1
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.errorCells,
            1
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.status,
            "incomplete"
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.filesAnalyzed,
            2
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.completedCells,
            1
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.errorCells,
            1
        );

        //check the overall summary
        assert.strictEqual(boostprojectdata.summary.filesAnalyzed, 2);

        //now let's change the data in the fileSummary and do the update, making sure that it's updated correctly
        fileSummaryItem.sections.bugAnalysisList.details?.push({
            severity: 10,
            description: "this is bad",
        });

        //get a new item for the update
        let updatedItem = boostNotebookFileToFileSummaryItem(fileUri);

        updatedItem.sections.bugAnalysisList.totalCells = 3;
        updatedItem.sections.bugAnalysisList.completedCells = 2;
        updatedItem.completedCells = 6;
        updatedItem.totalCells = 8;

        boostprojectdata.updateWithFileSummary(updatedItem, file);

        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.filesAnalyzed,
            2
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.status,
            "incomplete"
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.bugAnalysisList.completedCells,
            3
        );

        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.status,
            "incomplete"
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.filesAnalyzed,
            2
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.completedCells,
            1
        );
        assert.strictEqual(
            boostprojectdata.sectionSummary.complianceList.errorCells,
            1
        );
        done();
    });
});