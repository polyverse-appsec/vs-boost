import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from '../../extension';
import { getRandomTestSourceFile } from '../suite/utils';
import * as assert from 'assert';
import { getBoostNotebookFile} from '../../extension';
import { debug } from 'console';
import { BoostConfiguration } from '../../boostConfiguration';
import * as fs from 'fs';
import { BoostNotebook } from '../../jupyter_notebook';
import { rightClickLoadFileCommandTest } from './rightclick_LoadFile_command.test';


suite('Right Click Process File Command', function() {

    this.timeout(300000); // set test timeout to be 200 seconds (over 3 minutes to include Boost service request time)
  
    const randomFile = getRandomTestSourceFile();
    console.log(`${this.title} random source: ${randomFile}`);
    const fileUri = vscode.Uri.parse(randomFile);

    const boostUri = getBoostNotebookFile(fileUri);
    console.log(`${this.title} Boost Uri: ${boostUri.fsPath}`);

    test('Right Click Load File Command Test (Pre-Step for Processing)', async function() {

        await rightClickLoadFileCommandTest(this, fileUri, boostUri);

    });

    test('Right Click Process File Command Test', async function() {

        BoostConfiguration.currentKernelCommand = 'polyverse-boost-explain-kernel';

        assert.ok(fs.existsSync(boostUri.fsPath + '.boost'), `Notebook file ${boostUri.fsPath} not found`);

        // Execute the "createJsonNotebook" command
        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.processCurrentFile',
            fileUri);

        console.log(`Executed processCurrentFile command: ${BoostConfiguration.currentKernelCommand}`);

        // Wait for the notebook to be created
        await new Promise((resolve) =>
            setTimeout(resolve, 150000)); // 2.5 minutes to make sure Boost Service call completes

        assert.ok(fs.existsSync(boostUri.fsPath), `Notebook file ${boostUri.fsPath} not created`);

        const processedNotebook = new BoostNotebook();
        processedNotebook.load(boostUri.fsPath);

        processedNotebook.cells.forEach((cell : any) => {
            assert.ok(cell.outputs.length > 0, `No outputs found for cell ${cell.source}`);
            assert.ok(cell.outputs[0].metadata.outputType === 'explainCode', `First output is not explain`);
        });

    });
  
});
