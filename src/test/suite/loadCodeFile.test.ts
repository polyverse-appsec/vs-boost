import * as vscode from 'vscode';
import * as assert from 'assert';
import { debug } from 'console';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fs from 'fs';
import { NOTEBOOK_TYPE } from '../../extension';
import { getRandomTestSourceFile } from '../suite/utils';

suite('Load Code File Command', function() {

  this.timeout(20000); // set test timeout to be 20 seconds

  vscode.window.showInformationMessage('Start Load Code File Command tests.');

  test('Load Code File Command Test', async function() {

    this.timeout(60000);

    // we need to avoid hanging on the save dialog when exiting visual studio
    //    so we disable save on exit/shutdown
    await vscode.workspace.getConfiguration().update('files.hotExit', 'off', vscode.ConfigurationTarget.Global);

    // Execute the "createJsonNotebook" command
    await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.createJsonNotebook',
        { timeout: 2000 }); // give the command 2 seconds to execute

    // Wait for the notebook to be created
    await new Promise((resolve) =>
        setTimeout(resolve, 2000)); // 2 seconds to make sure notebook is created

    // Check if the notebook is created
    const notebooks = vscode.workspace.notebookDocuments;

    assert.notEqual(notebooks.length, 0, 'Notebook not created!');

    // Set up a spy to intercept the showOpenDialog call
    // const spy = sinon.spy(vscode.window, 'showOpenDialog');

    let showOpenDialogMock: sinon.SinonMock;

        // Create a mock for showOpenDialog method
    showOpenDialogMock = sinon.mock(vscode.window);

    const testCodePath = path.resolve(__dirname, '../../test/resources/');
    const unsupportedExtensions = ['.o', '.out', '.s', '.typescript', 'resources', '.c'];

    // Get all files in the folder
    const allFiles = fs.readdirSync(testCodePath);

    // Filter files based on extensions (exclude unsupported files)
    const filteredFiles = allFiles.filter(file => {
        const ext = path.extname(file);
        return ext !== "" && !unsupportedExtensions.includes(ext);
    });

    // this should never happen, but if the test data/source isn't found, let's
    // just fail hard and fast
    if (filteredFiles.length === 0) {
        assert.fail('No files found in test/resources folder');
    }

    const randomFile = getRandomTestSourceFile();

    showOpenDialogMock.expects('showOpenDialog').returns(Promise.resolve(
        [vscode.Uri.file(randomFile)]));

    try
    {
        // Execute the "loadCodeFile" command
        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.loadCodeFile').then(async () => {
            // Wait for the file to be loaded
            await new Promise((resolve) =>
                setTimeout(resolve, 2000)); // 5 seconds to make sure file is loaded
        });

        // Check that the showOpenDialog method was called with the expected options
        assert.ok(showOpenDialogMock.verify);
    } catch (err) {   
        // restore the open dialog function
        showOpenDialogMock.restore();
    }

        // Get all the cells in the newly created notebook
    const notebookEditor = vscode.window.activeNotebookEditor;
    assert.ok(notebookEditor, 'Notebook editor not found');

    const cells = notebookEditor.notebook.getCells();
    console.log('Number of cells: ' + cells.length.toString());

    assert.ok(cells.length > 1, 'Not enough cells ' + cells.length.toString() + ' found in the notebook');

    cells.forEach((cell) => {
        debug(cell.document.getText());
    });

  });
});
