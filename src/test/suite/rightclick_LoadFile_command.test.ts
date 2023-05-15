import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from '../../extension';
import { getRandomTestSourceFile } from '../suite/utils';
import * as assert from 'assert';
import { getBoostNotebookFile} from '../../extension';
import { debug } from 'console';
import * as fs from 'fs';

suite('Right Click Load File Command', function() {

    this.timeout(20000); // set test timeout to be 20 seconds

    const randomFile = getRandomTestSourceFile();
    console.log(`${this.title} random source: ${randomFile}`);
    const fileUri = vscode.Uri.parse(randomFile);

    const boostUri = getBoostNotebookFile(fileUri);
    console.log(`${this.title} Boost Uri: ${boostUri.fsPath}`);

    test('Right Click Load File Command Test', async function() {

        await rightClickLoadFileCommandTest(this, fileUri, boostUri);

    });
  
});

export async function rightClickLoadFileCommandTest(context: Mocha.Context, fileUri: vscode.Uri, boostUri: vscode.Uri) {

    // we need to avoid hanging on the save dialog when exiting visual studio
    //    so we disable save on exit/shutdown
    await vscode.workspace.getConfiguration().update('files.hotExit', 'off', vscode.ConfigurationTarget.Global);

    console.log(`Looking for existing Boost file ${boostUri.fsPath}`);
    // if the Boost notebook file already exists, delete it
    if (fs.existsSync(boostUri.fsPath + '.boost')) {
        console.log(`Found existing Boost notebook file ${boostUri.fsPath}`);
        fs.rmSync(boostUri.fsPath);
        console.log(`Deleted existing Boost notebook file ${boostUri.fsPath}`);
    } else {
        console.log(`Boost notebook file ${boostUri.fsPath} not found`);
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

    // Save the active text editor window
//    await vscode.commands.executeCommand('workbench.action.files.save');

    assert.ok(fs.existsSync(boostUri.fsPath), `Notebook file ${boostUri.fsPath} not created`);
    if (!fs.existsSync(boostUri.fsPath)) {
        assert.fail(`Notebook file ${boostUri.fsPath} not created`);
    } else {
        console.log(`Notebook file ${boostUri.fsPath} created`);
    }

    const cells = notebookEditor.notebook.getCells();
    console.log('Number of cells: ' + cells.length.toString());

    assert.ok(cells.length > 1, 'Not enough cells ' + cells.length.toString() + ' found in the notebook');
    
    cells.forEach((cell : vscode.NotebookCell) => {
            debug(cell.document.getText());
        });
}
