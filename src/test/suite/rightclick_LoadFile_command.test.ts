import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from '../../extension';
import { getRandomTestSourceFile } from '../runTest';

suite('Right Click Load File Command', function() {

    this.timeout(20000); // set test timeout to be 20 seconds
  
    test('Right Click Load File Command Test', async function() {
  
    // we need to avoid hanging on the save dialog when exiting visual studio
    //    so we disable save on exit/shutdown
    await vscode.workspace.getConfiguration().update('files.hotExit', 'off', vscode.ConfigurationTarget.Global);

    // Execute the "createJsonNotebook" command
    await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.loadCurrentFile',
        vscode.Uri.parse(getRandomTestSourceFile()) ); // give the command 2 seconds to execute

    // Wait for the notebook to be created
    await new Promise((resolve) =>
        setTimeout(resolve, 2000)); // 2 seconds to make sure notebook is created
      });
  });

async function selectFileInExplorer(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const resource = await vscode.workspace.fs.stat(uri);
    if (resource) {
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
        await vscode.commands.executeCommand('revealInExplorer', uri);
    }
}
