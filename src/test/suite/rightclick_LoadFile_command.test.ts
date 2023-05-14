import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from '../../extension';
import { getRandomTestSourceFile } from '../suite/utils';
import * as fs from 'fs';
import * as assert from 'assert';
import { getBoostNotebookFile} from '../../extension';

suite('Right Click Load File Command', function() {

    this.timeout(20000); // set test timeout to be 20 seconds
  
    test('Right Click Load File Command Test', async function() {
  
    // we need to avoid hanging on the save dialog when exiting visual studio
    //    so we disable save on exit/shutdown
    await vscode.workspace.getConfiguration().update('files.hotExit', 'off', vscode.ConfigurationTarget.Global);

    const fileUri = vscode.Uri.parse(getRandomTestSourceFile());

    // Execute the "createJsonNotebook" command
    await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.loadCurrentFile',
        fileUri);

    // Wait for the notebook to be created
    await new Promise((resolve) =>
        setTimeout(resolve, 2000)); // 2 seconds to make sure notebook is created

    const boostUri = getBoostNotebookFile(fileUri);
    assert.ok(fs.existsSync(boostUri.fsPath + '.boost'), 'Notebook file not created');

      });
  });
