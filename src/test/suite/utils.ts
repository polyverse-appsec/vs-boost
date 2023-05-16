
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { debug } from 'console';

export const seconds = 1000;
export const minutes = 60 * seconds;

export function getRandomTestSourceFile() : string {
    const testCodePath = path.resolve(__dirname, '../resources/');
    const unsupportedExtensions = ['.o', '.out', '.s', '.typescript', 'resources', '.c'];

    // Get all files in the folder
    const allFiles = fs.readdirSync(testCodePath);

    // Filter files based on extensions (exclude unsupported files)
    const filteredFiles = allFiles.filter(file => {
        const ext = path.extname(file);
        return ext !== "" && !unsupportedExtensions.includes(ext);
    });

    let randomFile: string;
    const targetTestInputPath = path.resolve(testCodePath, 'targetTestInput.json');
    console.log(`Looking for ${targetTestInputPath}`);
    if (fs.existsSync(targetTestInputPath)) {
        const targetTestInput = JSON.parse(fs.readFileSync(targetTestInputPath, 'utf-8'));
        randomFile = path.resolve(testCodePath, targetTestInput.filename[0]);
        console.log('Read targetTestInput.json, using file:', randomFile);
    } else {
        // Select a random file from the filtered files
        console.log('No targetTestInput.json, selecting random file from:', filteredFiles);
        const randomIndex = Math.floor(Math.random() * filteredFiles.length);
        randomFile = path.resolve(testCodePath,filteredFiles[randomIndex]);
    }
    
    debug("Source File: " + randomFile);
    return randomFile;
}

async function selectFileInExplorer(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const resource = await vscode.workspace.fs.stat(uri);
    if (resource) {
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
        await vscode.commands.executeCommand('revealInExplorer', uri);
    }
}