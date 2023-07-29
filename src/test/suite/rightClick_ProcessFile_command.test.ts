import * as vscode from "vscode";
import { NOTEBOOK_TYPE } from "../../jupyter_notebook";
import { getRandomTestSourceFile, seconds, minutes } from "../suite/utils";
import * as assert from "assert";
import { getBoostFile } from "../../extension";
import { debug } from "console";
import { BoostConfiguration } from "../../boostConfiguration";
import * as fs from "fs";
import { BoostNotebook } from "../../jupyter_notebook";
import { rightClickLoadFileCommandTest } from "./testCommandUtilities";
import { before } from 'mocha';

suite("Right Click Process File Command", function () {
    this.timeout(5 * minutes); // set test timeout to be 200 seconds (over 3 minutes to include Boost service request time)

    let randomFile;
    let fileUri: vscode.Uri, boostUri: vscode.Uri;
    const parent = this.parent;

    before(async function () {
        randomFile = getRandomTestSourceFile();
        console.log(`${parent?.title} random source: ${randomFile}`);
        fileUri = vscode.Uri.parse(randomFile);

        // now open up the file to get vscode initialized properly
        await vscode.commands.executeCommand("vscode.open", fileUri);

        boostUri = getBoostFile(fileUri);
        console.log(`${parent?.title} Boost Uri: ${boostUri.fsPath}`);
    });

    test("Right Click Load File Command Test (Pre-Step for Processing)", async function () {
        await rightClickLoadFileCommandTest(this, fileUri, boostUri);

        assert.ok(
            fs.existsSync(boostUri.fsPath),
            `Notebook file ${boostUri.fsPath} not found`
        );
    });

    test("Right Click Process File Command Test", async function () {
        BoostConfiguration.logLevel = "debug";
        BoostConfiguration.currentKernelCommand =
            "polyverse-boost-explain-kernel";
        assert.ok(
            BoostConfiguration.currentKernelCommand ===
                "polyverse-boost-explain-kernel",
            `BoostConfig is not polyverse-boost-explain-kernel`
        );

        assert.ok(
            fs.existsSync(boostUri.fsPath),
            `Notebook file ${boostUri.fsPath} not found`
        );

        console.log(`Running processCurrentFile command on ${boostUri.fsPath}`);
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + ".processCurrentFile",
            fileUri,
            BoostConfiguration.currentKernelCommand
        );

        console.log(`Ran processCurrentFile command on ${boostUri.fsPath}`);

        // Wait for the file to be processed
        await new Promise((resolve) => setTimeout(resolve, 2.5 * minutes)); // 2.5 minutes to make sure Boost Service call completes

        console.log(
            `Finished waiting for processCurrentFile command on ${boostUri.fsPath}`
        );

        assert.ok(
            fs.existsSync(boostUri.fsPath),
            `Notebook file ${boostUri.fsPath} not created`
        );

        const processedNotebook = new BoostNotebook();
        processedNotebook.load(boostUri.fsPath);

        processedNotebook.cells.forEach((cell: any) => {
            assert.ok(
                cell.outputs.length > 0,
                `No outputs found for cell ${cell.value}`
            );
            assert.ok(
                cell.outputs[0].metadata.outputType === "explainCode",
                `First output is not explain`
            );
        });
    });
});
