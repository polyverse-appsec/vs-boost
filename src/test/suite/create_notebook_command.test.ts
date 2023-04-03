import * as vscode from 'vscode';
import * as assert from 'assert';
import { debug } from 'console';
import * as crypto from 'crypto';

suite('Notebook Command', function() {

  this.timeout(20000); // set test timeout to be 20 seconds

  vscode.window.showInformationMessage('Start Create Notebook tests.');

  test('Create Notebook Command Test', async function() {

    this.timeout(5000);

    // Execute the "createJsonNotebook" command
    await vscode.commands.executeCommand('polyverse-boost-notebook.createJsonNotebook',
        { timeout: 2000 }); // give the command 2 seconds to execute

    // Wait for the notebook to be created
    await new Promise((resolve) =>
        setTimeout(resolve, 2000)); // 2 seconds to make sure notebook is created

    // Check if the notebook is created
    const notebooks = vscode.workspace.notebookDocuments;

    assert.notEqual(notebooks.length, 0, 'Notebook not created!');

    // we need to avoid hanging on the save dialg when exiting visual studio
    //    so we disable save on exit/shutdown
    await vscode.workspace.getConfiguration().update('files.hotExit', 'off', vscode.ConfigurationTarget.Global);
  });
});
