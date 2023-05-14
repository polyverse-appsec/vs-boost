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

  test('customerPortal command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.customerPortal') !== -1;
    }));
  });

  test('boostStatus command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.boostStatus') !== -1;
    }));
  });

  test('loadCurrentFile command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.loadCurrentFile') !== -1;
    }));
  });

  test('loadCurrentFolder command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.loadCurrentFolder') !== -1;
    }));
  });

  test('processCurrentFile command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.processCurrentFile') !== -1;
    }));
  });

  test('processCurrentFolder command should be present', () => {
    assert.ok(vscode.commands.getCommands().then(cmds => {
      return cmds.indexOf(NOTEBOOK_TYPE + '.processCurrentFolder') !== -1;
    }));
  });

});