import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import Mocha = require('mocha'); // Corrected import of Mocha

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
  });

  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((c, e) => {
    mocha.addFile(path.resolve(testsRoot, 'yourActualCommand.js'));

    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
