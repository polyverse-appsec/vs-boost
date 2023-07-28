import * as vscode from 'vscode';

let extensionMode: vscode.ExtensionMode | undefined = undefined;

export function setExtensionMode(mode: vscode.ExtensionMode) {
    extensionMode = mode;
}

export function getExtensionMode(): vscode.ExtensionMode | undefined {
    return extensionMode;
}

