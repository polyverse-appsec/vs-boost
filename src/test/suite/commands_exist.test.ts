import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Commands', () => {
  test('createJsonNotebook command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('extension.createJsonNotebook') !== -1;
    }));
  });

  test('loadCodeFile command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('extension.loadCodeFile') !== -1;
    }));
  });

  test('selectOutputLanguage command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('extension.selectOutputLanguage') !== -1;
    }));
  });

  test('selectTestFramework command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf('extension.selectTestFramework') !== -1;
    }));
  });
});