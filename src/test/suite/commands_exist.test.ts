import * as assert from 'assert';
import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from '../../extension';

suite('Extension Commands', () => {
  vscode.window.showInformationMessage('Start Command verification tests.');

  test('createJsonNotebook command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.createJsonNotebook') !== -1;
    }));
  });

  test('loadCodeFile command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.loadCodeFile') !== -1;
    }));
  });

  test('selectOutputLanguage command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.selectOutputLanguage') !== -1;
    }));
  });

  test('selectTestFramework command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.selectTestFramework') !== -1;
    }));
  });
});