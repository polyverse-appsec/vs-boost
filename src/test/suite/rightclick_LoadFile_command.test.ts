import * as vscode from 'vscode';
import { getRandomTestSourceFile } from '../suite/utils';
import { getBoostNotebookFile} from '../../extension';
import { rightClickLoadFileCommandTest } from './testCommandUtilities';

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