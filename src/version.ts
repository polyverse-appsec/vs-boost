import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

//keep a global variable for the extension version, start as empty string
let cachedVersion = "";

export function getCurrentExtensionVersion(): string | undefined {
    const extensionId = 'polyversecorporation.polyverse-boost-notebook'; // Replace this with your extension's ID
    const extension = vscode.extensions.getExtension(extensionId);

    if (cachedVersion !== "") {
        return cachedVersion;
    }

    if (!extension) {
        vscode.window.showErrorMessage('Extension not found.');
        return undefined;
    }

    const packageJsonPath = path.join(extension.extensionPath, 'package.json');
    
    try {
        const packageJsonData = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonData);
        const version = packageJson.version;

        if (!version) {
            vscode.window.showErrorMessage('Extension version not found.');
            return undefined;
        }
        cachedVersion = version;
        return version;
    } catch (error) {
        vscode.window.showErrorMessage('Error reading package.json: ' + (error as Error).message);
        return undefined;
    }
}