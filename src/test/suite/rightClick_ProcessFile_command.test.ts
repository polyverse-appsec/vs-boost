import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from '../../extension';
import { getRandomTestSourceFile } from '../suite/utils';
import * as assert from 'assert';
import { getBoostNotebookFile} from '../../extension';
import { debug } from 'console';
import { BoostConfiguration } from '../../boostConfiguration';
import * as fs from 'fs';

suite('Right Click Process File Command', function() {

    this.timeout(200000); // set test timeout to be 200 seconds (over 3 minutes to include Boost service request time)
  
    const fileUri = vscode.Uri.parse(getRandomTestSourceFile());

    const boostUri = getBoostNotebookFile(fileUri);

    test('Right Click Load File Command Test', async function() {
    
        // we need to avoid hanging on the save dialog when exiting visual studio
        //    so we disable save on exit/shutdown
        await vscode.workspace.getConfiguration().update('files.hotExit', 'off', vscode.ConfigurationTarget.Global);

        // if the Boost notebook file already exists, delete it
        if (fs.existsSync(boostUri.fsPath + '.boost')) {
            console.log(`Found existing Boost notebook file ${boostUri.fsPath}`);
            fs.rmSync(boostUri.fsPath);
            console.log(`Deleted existing Boost notebook file ${boostUri.fsPath}`);
        }

        // Execute the "createJsonNotebook" command
        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.loadCurrentFile',
            fileUri);

        // Wait for the notebook to be created
        await new Promise((resolve) =>
            setTimeout(resolve, 2000)); // 2 seconds to make sure notebook is created

        // Get all the cells in the newly created notebook
        const notebookEditor = vscode.window.activeNotebookEditor;
        assert.ok(notebookEditor, 'Notebook editor not found');
    
        const cells = notebookEditor.notebook.getCells();
        console.log('Number of cells: ' + cells.length.toString());
    
        assert.ok(cells.length > 1, 'Not enough cells ' + cells.length.toString() + ' found in the notebook');
        
        cells.forEach((cell : vscode.NotebookCell) => {
                debug(cell.document.getText());
            });
    });

    test('Right Click Process File Command Test', async function() {

        BoostConfiguration.currentKernelCommand = 'polyverse-boost-explain-kernel';

        // Execute the "createJsonNotebook" command
        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.processCurrentFile',
            fileUri);

        console.log(`Executed processCurrentFile command: ${BoostConfiguration.currentKernelCommand}`);

        // Wait for the notebook to be created
        await new Promise((resolve) =>
            setTimeout(resolve, 120000)); // 2 minutes to make sure Boost Service call completes

        assert.ok(fs.existsSync(boostUri.fsPath), `Notebook file ${boostUri.fsPath} not created`);

    });
  
});
