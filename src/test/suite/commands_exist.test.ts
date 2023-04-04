import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Commands', () => {
  vscode.window.showInformationMessage('Start Command verification tests.');

  test('createJsonNotebook command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('polyverse-boost-notebook.createJsonNotebook') !== -1;
    }));
  });

  test('loadCodeFile command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('polyverse-boost-notebook.loadCodeFile') !== -1;
    }));
  });

  test('selectOutputLanguage command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('polyverse-boost-notebook.selectOutputLanguage') !== -1;
    }));
  });

  test('selectTestFramework command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('polyverse-boost-notebook.selectTestFramework') !== -1;
    }));
  });
});